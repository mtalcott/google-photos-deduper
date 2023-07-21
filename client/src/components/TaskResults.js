import "./TaskResults.css";

export default function TaskResults({ results }) {
    if (!results) {
        return null;
    }

    return (
        <>
            <p>Info:</p>
            <pre>{JSON.stringify(results, null, 2)}</pre>
        </>
    );
}
