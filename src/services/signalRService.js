import * as signalR from "@microsoft/signalr";
// Import the MessagePack protocol
import { MessagePackHubProtocol } from "@microsoft/signalr-protocol-msgpack";

const connection = new signalR.HubConnectionBuilder()
    .withUrl("https://prop-backend-cszs.onrender.com/callHub")
    // Add the MessagePack protocol to the connection
    .withHubProtocol(new MessagePackHubProtocol())
    .withAutomaticReconnect()
    .build();

export const startSignalRConnection = async () => {
    if (connection.state === signalR.HubConnectionState.Disconnected) {
        try {
            await connection.start();
            console.log("SignalR Connected using MessagePack.");
        } catch (err) {
            console.error("SignalR Connection Error: ", err);
            setTimeout(startSignalRConnection, 5000);
        }
    }
};

export default connection;