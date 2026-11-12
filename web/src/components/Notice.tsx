import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Notice.module.css";

interface NoticeProps {
  tone: "error" | "neutral";
  children: ReactNode;
  action?: ReactNode;
}

export function Notice({ tone, children, action }: NoticeProps) {
  return (
    <div className={styles.notice} data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      <Icon name="alert" className={styles.icon} />
      <p className={styles.message}>{children}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
