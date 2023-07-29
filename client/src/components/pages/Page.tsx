import { useEffect } from "react";

export default function Page({ title, children }) {
  useEffect(() => {
    document.title = ["Google Photos Deduper", title]
      .filter((s) => s)
      .join(" | ");
  }, [title]);

  return <>{children}</>;
}
