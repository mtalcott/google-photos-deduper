import Toolbar from "@mui/material/Toolbar";
import AppBar from "@mui/material/AppBar";
import Typography from "@mui/material/Typography";

export default function DeduperDrawer() {
  return (
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
  );
}
