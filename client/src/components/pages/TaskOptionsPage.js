// import "./TaskOptionsPage.css";

import { useNavigate } from "react-router";
import { appApiUrl } from "utils";

export default function TaskOptionsPage() {
    const navigate = useNavigate();

    async function handleSubmit(e) {
        // Prevent the browser from reloading the page
        e.preventDefault();

        const form = e.target;
        const formData = new FormData(form);

        const response = await fetch(appApiUrl("/api/task"), {
            method: "post",
            body: formData,
        });

        if (response.ok) {
            navigate("/active_task");
        }
    }
    return (
        <>
            <p>Task Options</p>
            <form onSubmit={handleSubmit}>
                <label>
                    Refresh media items:
                    <input
                        type="checkbox"
                        defaultChecked={true}
                        name="refresh_media_items"
                        value="true"
                    />
                </label>
                <p>
                    <button type="submit">Submit</button>
                </p>
            </form>
        </>
    );
}
