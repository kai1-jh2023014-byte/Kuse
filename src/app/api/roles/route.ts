import { apiErrorResponse } from "@/lib/api";
import { proposeSlideCuts, providerMode } from "@/services/ai/provider";
import { planSlideRoles, segmentManuscript, type ManuscriptSegmentation } from "@/services/ai/slide-roles";
import { asSlideDrafts, requireRecord } from "@/services/ai/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      brief?: unknown;
      slides?: unknown;
      manuscript?: unknown;
      audit?: unknown;
    };
    const brief = body.brief && typeof body.brief === "object" ? requireRecord(body.brief, "制作内容の形式が不正です") : {};
    const text = (key: string) => {
      const raw = brief[key];
      return typeof raw === "string" ? raw.trim().slice(0, 1500) : "";
    };
    const purpose = text("purpose");
    const audience = text("audience");
    const manuscript = typeof body.manuscript === "string" ? body.manuscript.trim().slice(0, 8000) : "";
    const audit = typeof body.audit === "string" ? body.audit.trim().slice(0, 500) : "";

    if (manuscript) {
      const cut = segmentManuscript(manuscript, audit, purpose);
      let slides = cut.slides;
      let segmentation: ManuscriptSegmentation = {
        summary: cut.summary,
        reasons: cut.reasons,
        mode: "heuristic",
      };
      if (providerMode() === "vision" && cut.slides.length > 0) {
        try {
          const proposed = await proposeSlideCuts({ manuscript, purpose, audience, audit });
          if (proposed) {
            slides = proposed.map((slideText, index) => ({ id: `cut-${index + 1}`, text: slideText }));
            segmentation = {
              mode: "vision",
              reasons: proposed.map(() => "モデルが、原稿の中の感情の境目として切りました。"),
              summary: audit
                ? `${proposed.length}枚に分け直しました。監査を読んだうえで、原稿にある文だけを使っています。`
                : `${proposed.length}枚に分けました。原稿にある文だけを使い、感情の境目で切っています。`,
            };
          }
        } catch {
          segmentation = { ...segmentation, mode: "heuristic" };
        }
      }
      const plan = planSlideRoles(slides, { purpose, audience });
      return Response.json({ ...plan, sourceText: manuscript, segmentation });
    }

    const plan = planSlideRoles(asSlideDrafts(body.slides), { purpose, audience });
    return Response.json(plan);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
