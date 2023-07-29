import "./App.css";
import CssBaseline from "@mui/material/CssBaseline";
import Page from "components/pages/Page";
import HomePage from "components/pages/HomePage";
import TaskOptionsPage from "components/pages/TaskOptionsPage";
import ActiveTaskPage from "components/pages/ActiveTaskPage";
import Layout from "components/Layout";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useFetch } from "utils/useFetch";
import { appApiUrl } from "utils";
import { AppContext } from "utils/AppContext";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import VerticalNavbar from "./components/VerticalNavbar";
import Box from "@mui/material/Box";

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
      <Box sx={{ display: "flex" }}>
        <CssBaseline />
        <AppBar
          position="fixed"
          sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
        >
          <Toolbar>
            <Typography variant="h6" color="inherit" noWrap>
              Google Photos Deduper
            </Typography>
          </Toolbar>
        </AppBar>
        <VerticalNavbar />
        <main>
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
        </main>
      </Box>
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
