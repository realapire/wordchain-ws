const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

let nextClientId = 0;
const clients = {};
let sessions = {};

function handleJoinMessage(clientId, message) {
    // Er is een speler gejoined
    const { username, sessionId } = message;
    console.log(`User ${username} joined session ${sessionId}`);
}

function createSession() {

}

function deleteSession() {

}

server.on('connection', (socket) => {
    console.log('Client connected');

    const clientId = nextClientId++;
    clients[clientId] = socket;

    socket.on('message', (data) => {
        const message = JSON.parse(data);
        console.log(`Received message from client ${clientId}:`, message);

        switch (message.type) {
            case 'join':
                handleJoinMessage(clientId, message);
                break;
            case 'create-session':
                createSession();
                break;
            case 'delete-session':
                deleteSession();
                break;
            default:
                console.warn(`Unknown message type: ${message.type}`);
                break;
        }
    });

    socket.on('close', (event) => {
        console.log(`Client ${clientId} disconnected`);
        delete clients[clientId];
    });
});
