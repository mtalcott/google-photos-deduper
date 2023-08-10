import React, { useEffect, useState } from "react";
import "./App.css";
import CssBaseline from "@mui/material/CssBaseline";
import Page from "components/pages/Page";
import HomePage from "components/pages/HomePage";
import TaskOptionsPage from "components/pages/TaskOptionsPage";
import ActiveTaskPage from "components/pages/ActiveTaskPage";
import Layout from "components/Layout";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link as RouterLink,
  LinkProps as RouterLinkProps,
} from "react-router-dom";
import Link, { LinkProps } from "@mui/material/Link";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useFetch } from "utils/useFetch";
import { appApiUrl, fetchAppJson } from "utils";
import { ActiveTaskType, MeResponseType } from "utils/MeResponseType";
import { AppContext, AppContextType } from "utils/AppContext";
import DeduperAppBar from "components/DeduperAppBar";
import DeduperDrawer from "components/DeduperDrawer";
import Box from "@mui/material/Box";
import TaskResultsPage from "components/pages/TaskResultsPage";

export default function App() {
  const { data: me, isLoading: meIsLoading } = useFetch<MeResponseType>(
    appApiUrl("/auth/me")
  );
  const [activeTask, setActiveTask] = useState<ActiveTaskType | null>(null);
  const reloadActiveTask = async () => {
    const activeTaskJson = await fetchAppJson("/api/active_task");
    setActiveTask(activeTaskJson);
  };
  useEffect(() => {
    reloadActiveTask();
  }, []);

  if (meIsLoading) {
    return null;
  }

  const appState: AppContextType = {
    user: me?.user_info,
    isLoggedIn: me?.logged_in || false,
    hasActiveTask: me?.has_active_task || false,
    activeTask: activeTask || undefined,
    reloadActiveTask: reloadActiveTask,
  };

  return (
    <AppContext.Provider value={appState}>
      <CssBaseline />
      <ThemeProvider theme={theme}>
        <Router>
          <Box sx={{ display: "flex" }}>
            <DeduperAppBar />
            <DeduperDrawer />
            <Box
              component="main"
              sx={{ minHeight: "100vh", flexGrow: 1, px: 2, pt: 10 }}
            >
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
                      <Page title="Select Options">
                        <TaskOptionsPage />
                      </Page>
                    }
                  />
                  <Route
                    path="/active_task"
                    element={
                      <Page title="Process Duplicates">
                        <ActiveTaskPage />
                      </Page>
                    }
                  />
                  <Route
                    path="/active_task/results"
                    element={
                      <Page title="Review and Delete Duplicates">
                        <TaskResultsPage />
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
            </Box>
          </Box>
        </Router>
      </ThemeProvider>
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

// See https://mui.com/material-ui/guides/routing/#global-theme-link
const LinkBehavior = React.forwardRef<
  HTMLAnchorElement,
  Omit<RouterLinkProps, "to"> & { href: RouterLinkProps["to"] }
>((props, ref) => {
  const { href, ...other } = props;
  // Map href (Material UI) -> to (react-router)
  return <RouterLink ref={ref} to={href} {...other} />;
});

const theme = createTheme({
  components: {
    MuiLink: {
      defaultProps: {
        component: LinkBehavior,
      } as LinkProps,
    },
    MuiButtonBase: {
      defaultProps: {
        LinkComponent: LinkBehavior,
      },
    },
  },
});
