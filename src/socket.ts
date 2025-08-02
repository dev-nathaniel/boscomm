import {io} from 'socket.io-client';

const URL = 'https://boscomm-server.onrender.com';

export const socket = io(URL);