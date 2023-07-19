import "./App.css";
import HomePage from "components/pages/HomePage";
import ActiveTaskPage from "components/pages/ActiveTaskPage";
import Layout from "components/Layout";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useFetch } from "utils/useFetch";
import { appApiUrl } from "utils";
import { AppContext } from "utils/AppContext";

export default function App() {
    const { data, isLoading } = useFetch(appApiUrl("/auth/me"));

    if (isLoading) {
        return null;
    }

    const user = data?.user_info;
    const isLoggedIn = !!user;

    return (
        <AppContext.Provider value={{ user, isLoggedIn }}>
            <div className="App">
                <Router>
                    <Routes>
                        <Route path="/" element={<Layout />}>
                            <Route index element={<HomePage />} />
                            <Route
                                path="/active_task"
                                element={<ActiveTaskPage />}
                            />
                            <Route path="*" element={<NoPage />} />
                        </Route>
                    </Routes>
                </Router>
            </div>
        </AppContext.Provider>
    );
}

function NoPage() {
    return (
        <div>
            <h2>Nothing to see here!</h2>
            <p>
                <Link to="/">Go to the home page</Link>
            </p>
        </div>
    );
}
