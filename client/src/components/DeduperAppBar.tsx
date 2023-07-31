import Toolbar from "@mui/material/Toolbar";
import AppBar from "@mui/material/AppBar";
import Link from "@mui/material/Link";

export default function DeduperDrawer() {
  return (
    <AppBar
      position="fixed"
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
    >
      <Toolbar>
        <Link to="/" variant="h6" color="inherit" underline="none" noWrap>
          Google Photos Deduper
        </Link>
      </Toolbar>
    </AppBar>
  );
}
