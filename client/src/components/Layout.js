import { Outlet, Link } from "react-router-dom";
import { useContext } from "react";
import { AppContext } from "utils/AppContext";

export default function Layout() {
    const { isLoggedIn } = useContext(AppContext);

    return (
        <>
            <header className="App-header">
                <h1>Google Photos Deduper</h1>
                {isLoggedIn && (
                    <Link reloadDocument to="/api/logout">
                        Logout
                    </Link>
                )}
            </header>
            <div>
                {/* A "layout route" is a good place to put markup you want to
            share across all the pages on your site, like navigation. */}
                <nav>
                    <ul>
                        <li>
                            <Link to="/">Home</Link>
                        </li>
                    </ul>
                </nav>

                <hr />

                {/* An <Outlet> renders whatever child route is currently active,
            so you can think about this <Outlet> as a placeholder for
            the child routes we defined above. */}
                <Outlet />
            </div>
        </>
    );
}
