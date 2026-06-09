import { useEffect } from "react";
import SystemState from "@/components/SystemState";

const NotFoundPage = () => {
  useEffect(() => {
    document.title = "Page Not Found — LevelUp Learning";
  }, []);

  return <SystemState kind="404" />;
};

export default NotFoundPage;
