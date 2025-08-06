import * as signalR from "@microsoft/signalr";
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";

const connection = new signalR.HubConnectionBuilder()
    .withUrl("https://prop-backend-cszs.onrender.com/callHub")
    .withHubProtocol(new MessagePackHubProtocol())
    .withAutomaticReconnect()
    .build();

// NEW: Function to notify the app about connection status changes
export const setConnectionStatusCallback = (callback) => {
    connection.onreconnecting(() => callback("Reconnecting..."));
    connection.onreconnected(() => callback("Connected"));
    connection.onclose(() => callback("Disconnected"));
};

export const startSignalRConnection = async (callback) => {
    if (connection.state === signalR.HubConnectionState.Disconnected) {
        try {
            callback("Connecting...");
            await connection.start();
            console.log("SignalR Connected using MessagePack.");
            callback("Connected");
        } catch (err) {
            console.error("SignalR Connection Error: ", err);
            callback("Disconnected");
            setTimeout(() => startSignalRConnection(callback), 5000);
        }
    }
};

export default connection;