import { useEffect } from "react";

const usePageTitle = (title: string) => {
  useEffect(() => {
    document.title = title ? `${title} — LevelUp Learning` : "LevelUp Learning";
  }, [title]);
};

export default usePageTitle;
