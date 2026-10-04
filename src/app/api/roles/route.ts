import { apiErrorResponse } from "@/lib/api";
import { attachCommonsMedia, canSearch } from "@/services/ai/commons";
import { proposeSlideCuts, providerMode } from "@/services/ai/provider";
import { wantsWebMedia } from "@/services/ai/slide-media";
import { planFromManuscript } from "@/services/ai/deck-architecture";
import { planSlideRoles, type DeckRolePlan, type ManuscriptSegmentation } from "@/services/ai/slide-roles";
import { asSlideDrafts, requireRecord } from "@/services/ai/validate";

export const runtime = "nodejs";

async function withMedia(plan: DeckRolePlan, fetchMedia: boolean): Promise<DeckRolePlan> {
  if (!fetchMedia) return plan;
  try {
    const slides = await attachCommonsMedia(plan.slides);
    const missed = slides.some((slide) => canSearch(slide.media));
    return {
      ...plan,
      slides,
      warnings: missed ? [...plan.warnings, "コモンズで見つからなかった素材があります。指示だけ残しています。"] : plan.warnings,
    };
  } catch {
    return { ...plan, warnings: [...plan.warnings, "ネットの素材を取れませんでした。置く場所の指示だけ残しています。"] };
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      brief?: unknown;
      slides?: unknown;
      manuscript?: unknown;
      audit?: unknown;
      fetchMedia?: unknown;
      directionId?: unknown;
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
    const directionId = typeof body.directionId === "string" ? body.directionId : "";
    const fetchMedia = body.fetchMedia === true || wantsWebMedia(audit);

    if (manuscript) {
      const plan = planFromManuscript(manuscript, { purpose, audience, audit, directionId });
      let segmentation: ManuscriptSegmentation = {
        summary: plan.architectureSummary || `${plan.slides.length}枚に再構成しました。方向性を選ぶと、残す論点と捨てる論点が変わります。`,
        reasons: plan.slides.map((slide) => slide.connectsFrom || slide.oneMessage || ""),
        mode: "heuristic",
      };
      if (providerMode() === "vision" && !directionId) {
        try {
          const proposed = await proposeSlideCuts({ manuscript, purpose: plan.centralMessage || purpose, audience, audit });
          if (proposed && proposed.length >= 3) {
            const rebuilt = planSlideRoles(
              proposed.map((slideText, index) => ({ id: `cut-${index + 1}`, text: slideText })),
              { purpose: plan.centralMessage || purpose, audience },
            );
            const merged = {
              ...rebuilt,
              directions: plan.directions,
              chosenDirectionId: plan.chosenDirectionId,
              centralMessage: plan.centralMessage,
              keptClaims: plan.keptClaims,
              droppedClaims: plan.droppedClaims,
              architectureSummary: plan.architectureSummary,
              review: plan.review,
            };
            const withMediaPlan = await withMedia(merged, fetchMedia);
            return Response.json({
              ...withMediaPlan,
              sourceText: manuscript,
              segmentation: {
                mode: "vision" as const,
                reasons: proposed.map(() => "モデルが、選んだ方向性の感情の境目として切りました。"),
                summary: `${proposed.length}枚。中心メッセージ「${plan.centralMessage}」に沿っています。`,
              },
            });
          }
        } catch {
          segmentation = { ...segmentation, mode: "heuristic" };
        }
      }
      const withMediaPlan = await withMedia(plan, fetchMedia);
      return Response.json({ ...withMediaPlan, sourceText: manuscript, segmentation });
    }

    const plan = await withMedia(planSlideRoles(asSlideDrafts(body.slides), { purpose, audience }), fetchMedia);
    return Response.json(plan);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
