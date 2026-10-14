import { useSyncExternalStore } from "react";
import { getUiState, subscribeUiState } from "../ui-store";

/**
 * Background work, on screen.
 *
 * A job exists so that a long command stops being something to wait for — which only helps if the person can see
 * that it is running. The book pushes; this renders what it pushed, with no polling and no second copy.
 */
export function JobsStrip() {
  const { jobs } = useSyncExternalStore(subscribeUiState, getUiState);
  if (jobs.length === 0) return null;
  return (
    <div className="jobs-strip">
      {jobs.map((job, index) => (
        <span className={"job-chip job-" + job.status} key={String(index)} title={job.label}>
          {`job · ${job.label.slice(0, 28)}`}
          <span className="job-status">{job.status}</span>
        </span>
      ))}
    </div>
  );
}
