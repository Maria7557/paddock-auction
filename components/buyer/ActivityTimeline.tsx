import { formatAed } from "@/src/lib/utils";

import styles from "./ActivityTimeline.module.css";

type ActivityTimelineProps = {
  events: Array<{
    type: "winning" | "outbid" | "watched";
    lotTitle: string;
    amount?: number;
    timeAgo: string;
  }>;
};

function getSummary(event: ActivityTimelineProps["events"][number]): string {
  if (event.type === "winning") {
    return `You're leading ${event.amount !== undefined ? formatAed(event.amount) : ""}`.trim();
  }

  if (event.type === "outbid") {
    return `You were outbid ${event.amount !== undefined ? formatAed(event.amount) : ""}`.trim();
  }

  return "Added to watchlist";
}

function getToneClass(type: ActivityTimelineProps["events"][number]["type"]): string {
  if (type === "winning") {
    return styles.dotWinning;
  }

  if (type === "outbid") {
    return styles.dotOutbid;
  }

  return styles.dotWatched;
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>Recent activity</h2>
      </div>

      {events.length === 0 ? (
        <p className={styles.empty}>No activity yet</p>
      ) : (
        <ul className={styles.list}>
          {events.map((event, index) => (
            <li key={`${event.type}-${event.lotTitle}-${event.timeAgo}-${index}`} className={styles.item}>
              <span className={`${styles.dot} ${getToneClass(event.type)}`} aria-hidden="true" />
              <div className={styles.copy}>
                <strong>{getSummary(event)}</strong>
                <span>{event.lotTitle}</span>
              </div>
              <time className={styles.time}>{event.timeAgo}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
