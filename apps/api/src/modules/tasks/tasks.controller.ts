import { Controller, Param, Sse, type MessageEvent } from "@nestjs/common";
import { from, map, Observable, switchMap, takeWhile, timer } from "rxjs";
import { RagTaskService } from "../knowledge/rag.service";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: RagTaskService) {}

  @Sse(":jobId/stream")
  stream(@Param("jobId") jobId: string): Observable<MessageEvent> {
    return timer(0, 500).pipe(
      switchMap(() => from(this.tasks.getJob(jobId))),
      map((job) => ({
        data: job
          ? { type: job.status === "completed" || job.status === "failed" ? "done" : "task.progress", payload: job }
          : { type: "done", payload: { id: jobId, status: "failed", progress: 100, label: "任务不存在" } }
      })),
      takeWhile((event) => {
        const status = (event.data as { payload: { status: string } }).payload.status;
        return status !== "completed" && status !== "failed";
      }, true)
    );
  }
}
