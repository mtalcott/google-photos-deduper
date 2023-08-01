import { Outlet, Link } from "react-router-dom";
import { useContext } from "react";
import { AppContext } from "utils/AppContext";
import { appApiUrl } from "utils";

export default function Layout() {
  const { isLoggedIn } = useContext(AppContext);

  return (
    <>
      {/* An <Outlet> renders whatever child route is currently active,
          so you can think about this <Outlet> as a placeholder for
          the child routes we defined above. */}
      <Outlet />
    </>
  );
}
