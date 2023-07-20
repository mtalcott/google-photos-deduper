import "./App.css";
import Page from "components/pages/Page";
import HomePage from "components/pages/HomePage";
import TaskOptionsPage from "components/pages/TaskOptionsPage";
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

    const appState = {
        user: data?.user_info,
        isLoggedIn: data?.logged_in,
        hasActiveTask: data?.has_active_task,
    };

    return (
        <AppContext.Provider value={appState}>
            <div className="App">
                <Router>
                    <Routes>
                        <Route path="/" element={<Layout />}>
                            <Route
                                index
                                element={
                                    <Page>
                                        <HomePage />
                                    </Page>
                                }
                            />
                            <Route
                                path="/task_options"
                                element={
                                    <Page title="Task Options">
                                        <TaskOptionsPage />
                                    </Page>
                                }
                            />
                            <Route
                                path="/active_task"
                                element={
                                    <Page title="Active Task">
                                        <ActiveTaskPage />
                                    </Page>
                                }
                            />
                            <Route
                                path="*"
                                element={
                                    <Page title="Not Found">
                                        <NoPage />
                                    </Page>
                                }
                            />
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
            <h2>Page not found</h2>
            <p>
                <Link to="/">Go to the home page</Link>
            </p>
        </div>
    );
}
