/** Fill a missing purpose from the manuscript so the user does not have to write a brief. */
export function inferPurpose(manuscript: string, audience = ""): string {
  const lines = manuscript
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#{1,3}\s/.test(line));
  const first = (lines[0] ?? "").replace(/[。．!?！？]+$/g, "");
  const who = audience.trim();
  if (first.length >= 6 && first.length <= 80) {
    return who
      ? `${who}が、「${first}」を自分ごととして持ち帰れる発表にする`
      : `「${first}」を、聞き手が自分ごととして受け取れる発表にする`;
  }
  return who ? `${who}の気持ちが一段動く発表にする` : "この原稿の順番で、聞き手の気持ちが一段動く発表にする";
}

export function hasEnoughTalk(manuscript: string): boolean {
  return manuscript.trim().length >= 12;
}
