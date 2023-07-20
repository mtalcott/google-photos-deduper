// import "./ActiveTaskPage.css";

import { useEffect, useState } from "react";
import { useFetch } from "utils/useFetch";
import { appApiUrl } from "utils";
import { Link } from "react-router-dom";
import { socket } from "utils/socket";

export default function ActiveTaskPage() {
    const { data, isLoading } = useFetch(appApiUrl("/api/active_task"));
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [update, setUpdate] = useState([]);
    useEffect(() => {
        function onConnect() {
            console.log("connected");
            setIsConnected(true);
        }

        function onDisconnect() {
            console.log("disconnected");
            setIsConnected(false);
        }

        function onTaskUpdate(message) {
            console.log("onTaskUpdate", message);
            setUpdate((previous) => [...previous, message]);
        }

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("task_update", onTaskUpdate);

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
            socket.off("task_update", onTaskUpdate);
        };
    }, []);
    // useEffect(() => {
    //     // const url = appApiUrl("/api/active_task_ws").replace("http", "ws");
    //     const url = "ws://localhost/socket.io";
    //     const ws = new WebSocket(url);
    //     ws.addEventListener("open", () => console.log("ws opened"));
    //     ws.addEventListener("close", () => console.log("ws closeed"));
    //     ws.addEventListener("message", (event) => {
    //         console.log("ws message", event);
    //     });
    //     return () => {
    //         ws.close();
    //     };
    // }, []);

    if (isLoading) {
        return null;
    }

    return (
        <>
            <p>Status: {data.status}</p>
            <Link to="/task_options">Start over</Link>
            {data.info && (
                <>
                    <p>Messages:</p>
                    <pre>{JSON.stringify(update, null, 2)}</pre>
                    <p>Info:</p>
                    <pre>{JSON.stringify(data.info, null, 2)}</pre>
                </>
            )}
        </>
    );
}
