import { fetchInterviews } from "@/lib/interview";
import InterviewListClient from "./_components/interview-list-client";

export const revalidate = 60;

export default async function InterviewPage() {
  const articles = await fetchInterviews();
  return <InterviewListClient articles={articles} />;
}
