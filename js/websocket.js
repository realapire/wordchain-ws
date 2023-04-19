// https://www.npmjs.com/package/ws
// documentatie: https://github.com/websockets/ws
const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

let nextClientId = 0;
const clientsSockets = {};
let sessions = {};

function handleJoinMessage(clientId, message) {
    // Er is een speler gejoined
    const { username } = message;
    console.log(`User ${username} (clientId: ${clientId}) has connected with the server`);
    clientsSockets[clientId].username = username;
}


function createSession(clientId) {
    let sessionId;

    do {
        sessionId = Math.random().toString(36).substring(7);
    } while (sessionId in sessions);

    const session = {
        id: sessionId,
        host: clientId,
        players: [{
            id: clientId,
            name: clientsSockets[clientId].username,
            score: 0,
            eliminated: false,
        }],
    };

    sessions[sessionId] = session;

    const response = {
        type: 'session-created',
        sessionId: sessionId,
        host: session.players[0],
        players: session.players,
    };

    clientsSockets[clientId].send(JSON.stringify(response));

    console.log(`Session ${sessionId} created`);
}

function leaveSession(clientId) {
    const session = findSessionByClientId(clientId);
    if (!session) {
        console.error(`Client ${clientId} is not in a session`);
        return;
    }

    const playerIndex = session.players.findIndex(player => player.id == clientId);
    if (playerIndex == -1) {
        console.error(`Client ${clientId} is not a player in session ${session.id}`);
        return;
    }

    session.players.splice(playerIndex, 1);

    let newHost = false;

    if (clientId == session.host) {
        if (session.players.length == 0) {
            delete sessions[session.id];
            console.log(`Session ${session.id} deleted`);
            return;
        } else {
            newHost = session.players[Math.floor(Math.random() * session.players.length)];
            session.host = newHost.id;
            console.log(`New host for session ${session.id} is ${newHost.name}`);
        }
    }

    const response = {
        type: 'session-left',
        sessionId: session.id,
        host: session.host,
        players: session.players,
    };

    for (const player of session.players) {
        if (player.id == session.host) {
            // Stuurt dit door om priveleges te geven aan de nieuwe host
            clientsSockets[player.id].send(JSON.stringify({ type: 'start-privilege' }));
        }
        clientsSockets[player.id].send(JSON.stringify(response));
    }

    console.log(`Client ${clientId} left session ${session.id}`);

    if (newHost) {
        // Host element moet vooraan de array staan vandaar de unshift
        const newHostIndex = session.players.findIndex(player => player.id == newHost.id);
        if (newHostIndex != -1 && newHostIndex != 0) {
            session.players.splice(newHostIndex, 1);
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/unshift
            session.players.unshift(newHost);
        }
    }
}

function joinSession(clientId, message) {
    const { sessionId } = message;

    if (!(sessionId in sessions)) {
        console.error(`Session ${sessionId} not found`);
        return;
    }

    const session = sessions[sessionId];
    const player = {
        id: clientId,
        name: clientsSockets[clientId].username,
        score: 0,
        eliminated: false,
    };

    session.players.push(player);

    const response = {
        type: 'session-joined',
        sessionId,
        host: session.players[0],
        players: session.players,
    };

    for (const player of session.players) {
        clientsSockets[player.id].send(JSON.stringify(response));
    }

    console.log(`Client ${clientId} joined session ${sessionId}`);
}

function startSession(clientId) {
    const session = findSessionByClientId(clientId);
    if (!session) {
        console.error(`Client ${clientId} is not in a session`);
        return;
    }

    if (clientId != session.host) {
        console.error(`Client ${clientId} is not authorized to start session ${session.id}`);
        return;
    }

    // Check of er 2 tot 5 mensen zijn verbonden
    if (session.players.length < 2 || session.players.length > 5) {
        console.error(`Session ${session.id} cannot start. Number of players should be between 2 and 5.`);
        return;
    }

    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const startLetter = letters[Math.floor(Math.random() * letters.length)];

    session.words = []; // words array om bijtehouden wat er is gezegd per sessie
    session.lastLetter = startLetter;

    session.players.forEach(player => {
        const startMessage = {
            type: 'start',
            sessionId: session.id,
            startLetter: startLetter
        };
        clientsSockets[player.id].send(JSON.stringify(startMessage));
    });

    console.log(`Session ${session.id} started with start letter ${startLetter}`);
}


function checkWord(clientId, message) {
    console.log(message);
    if (message.currentplayer.name != clientsSockets[clientId].username) {
        console.log(`It is ${message.currentplayer.name} turns. Wait for your turn.`);
        return;
    }

    const session = findSessionByClientId(clientId);
    if (!session) {
        console.error(`Client ${clientId} is not in a session`);
        return;
    }

    const { word } = message;

    if (word[0] != session.lastLetter) {
        console.error(`Word does not begin with start letter ${session.startLetter}`);
        wrongAnswer(session, message.currentplayer);
        return;
    }

    if (message.fetchdata.title) {
        console.error('The entered word is invalid');
        wrongAnswer(session, message.currentplayer);
        return;
    }

    if (session.words.includes(word)) {
        console.error('The entered word has already been used');
        wrongAnswer(session, message.currentplayer);
        return;
    }

    // Als het woord wel juist is, doe dit...
    session.words.push(word);
    session.lastLetter = word[word.length - 1];

    session.players.forEach(player => {
        const startMessage = {
            type: 'correct-answer',
            lastLetter: word[word.length - 1],
            currentplayer: message.currentplayer
        };
        clientsSockets[player.id].send(JSON.stringify(startMessage));
    });
}


function wrongAnswer(session, currentplayer) {
    session.players.forEach(player => {
        const startMessage = {
            type: 'wrong-answer',
            currentplayer
        };
        clientsSockets[player.id].send(JSON.stringify(startMessage));
    });
}

function timeUp(clientId, currentPlayer) {
    const session = findSessionByClientId(clientId);
    if (!session) {
        console.error(`Client ${clientId} is not in a session`);
        return;
    }

    session.players.forEach(player => {
        if (player.id != clientId) {
            const message = {
                type: 'time-up',
                currentPlayer
            };
            clientsSockets[player.id].send(JSON.stringify(message));
        }
    });
}

function findSessionByClientId(clientId) {
    for (const sessionId in sessions) {
        const playerIds = sessions[sessionId].players.map(player => player.id);
        if (playerIds.includes(clientId)) {
            return sessions[sessionId];
        }
    }
    console.error(`Client ${clientId} is not in a session`);
    return null;
}


server.on('connection', (socket) => {
    console.log('Client connected');

    const clientId = nextClientId++;
    clientsSockets[clientId] = socket;

    socket.on('message', (data) => {
        const message = JSON.parse(data);
        console.log(`Received message from client ${clientId}:`, message);

        switch (message.type) {
            case 'join':
                handleJoinMessage(clientId, message);
                break;
            case 'create-session':
                createSession(clientId, message);
                break;
            case 'join-session':
                joinSession(clientId, message);
                break;
            case 'leave-session':
                leaveSession(clientId);
                break;
            case 'start-session':
                startSession(clientId);
                break;
            case 'check-word':
                checkWord(clientId, message);
                break;
            case 'time-up':
                timeUp(clientId, message.currentPlayer);
            default:
                console.warn(`Unknown message type: ${message.type}`);
                break;
        }
    });

    socket.on('close', (event) => {
        console.log(`Client ${clientId} disconnected`);
        leaveSession(clientId);
        // Delete gebruikt voor het verwijderen van een property van een object
        delete clientsSockets[clientId];
    });
});
