
import { io } from 'socket.io-client';

const socket = io({
  transports: ['websocket', 'polling'], // Try WebSocket first, fall back to polling
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 20000,
});

socket.on('connect_error', (err) => {
  console.error('Socket connection error:', err.message);
  // The app will automatically fall back to polling if websocket fails
});

socket.on('connect', () => {
  console.log('Socket connected successfully');
});

export default socket;
