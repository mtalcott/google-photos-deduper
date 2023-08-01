import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Grow from "@mui/material/Grow";
import { useEffect } from "react";

type PageProps = {
  title?: string;
  children: React.ReactNode;
};

export default function Page({ title, children }: PageProps) {
  useEffect(() => {
    document.title = ["Google Photos Deduper", title]
      .filter((s) => s)
      .join(" | ");
  }, [title]);

  return (
    <Grow in key={title}>
      <Box>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        {children}
      </Box>
    </Grow>
  );
}
