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

  return <>{children}</>;
}
