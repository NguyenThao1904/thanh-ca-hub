import { useEffect } from "react";
import { useAppConfig } from "@/api/queries";

/** Sets the browser tab title: "Page · App name". */
export function useTitle(title?: string | null) {
  const { appName } = useAppConfig();
  useEffect(() => {
    document.title = title ? `${title} · ${appName}` : appName;
  }, [title, appName]);
}
