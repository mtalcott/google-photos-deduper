import Toolbar from "@mui/material/Toolbar";
import AppBar from "@mui/material/AppBar";
import Link from "@mui/material/Link";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useContext, useState } from "react";
import { AppContext } from "utils/AppContext";
import { appApiUrl } from "utils";

export default function DeduperAppBar() {
  const [anchorElUser, setAnchorElUser] = useState<null | HTMLElement>(null);
  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElUser(event.currentTarget);
  };
  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };
  const { isLoggedIn, user } = useContext(AppContext);

  async function handleLogout(e) {
    // Prevent the browser from reloading the page
    e.preventDefault();

    const response = await fetch(appApiUrl("/api/logout"), {
      method: "post",
    });

    if (response.ok) {
      window.location.href = "/";
    }
  }

  return (
    <AppBar
      position="fixed"
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
    >
      <Toolbar>
        <Box sx={{ flexGrow: 1, display: "flex" }}>
          <Link
            to="/"
            variant="h6"
            color="inherit"
            underline="none"
            noWrap
            sx={{
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <img
              src="/logo.svg"
              alt="logo"
              style={{ width: 30, height: 30, marginRight: 16 }}
            />
            Google Photos Deduper
          </Link>
        </Box>

        {isLoggedIn && (
          <Box sx={{ alignItems: "right" }}>
            <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
              <Avatar alt={user.name} src={user.picture} />
            </IconButton>
            <Menu
              sx={{ mt: "45px" }}
              id="menu-appbar"
              anchorEl={anchorElUser}
              anchorOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
              keepMounted
              transformOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
              open={Boolean(anchorElUser)}
              onClose={handleCloseUserMenu}
            >
              <MenuItem onClick={handleLogout}>
                <Typography textAlign="center">Logout</Typography>
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}
