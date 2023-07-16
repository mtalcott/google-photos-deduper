// import "./HomePage.css";

import { useFetch } from "utils/useFetch";
import { appApiUrl } from "utils";

export default function HomePage() {
    const { data, error } = useFetch(appApiUrl("/auth/me"));

    // if (error) return <p>There was an error.</p>;
    // if (!data) return <p>Loading...</p>;

    return (
        <>
            <div className="HomePage">Home</div>
        </>
    );
}
