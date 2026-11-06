import { useEffect, useState } from "react";
import type { RenderPayload } from "../lib/types";
import { renderBlob } from "../lib/export";
import { layout } from "../lib/core";
import { translate } from "../i18n";
export function Preview({
  payload,
  className = "",
  guide = false,
}: {
  payload: RenderPayload;
  className?: string;
  guide?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let current = "";
    setFailed(false);
    renderBlob(payload)
      .then((blob) => {
        if (alive) {
          current = URL.createObjectURL(blob);
          setUrl(current);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (current) URL.revokeObjectURL(current);
    };
  }, [payload]);
  const t = (k: Parameters<typeof translate>[1]) =>
    translate(payload.options.locale, k);
  const geometry = layout(payload.options.format);
  const circle = geometry.circle;
  const avatar = geometry.avatar;
  return (
    <div
      className={`render-preview ${className} ${payload.options.format}`}
      aria-busy={!url && !failed}
    >
      {url ? (
        <img src={url} alt={payload.token.name} draggable="false" />
      ) : (
        <div className="render-wait" role="status">
          {t(failed ? "exportError" : "loading")}
        </div>
      )}
      {guide && payload.options.format === "pfp" && (
        <div
          className="circle-guide"
          role="img"
          aria-label={t("safeCircle")}
          style={
            circle
              ? {
                  inset: "auto",
                  left: ((circle.x - circle.r) / geometry.width) * 100 + "%",
                  top: ((circle.y - circle.r) / geometry.height) * 100 + "%",
                  width: ((circle.r * 2) / geometry.width) * 100 + "%",
                  height: ((circle.r * 2) / geometry.height) * 100 + "%",
                }
              : undefined
          }
        />
      )}{" "}
      {guide && payload.options.format === "banner" && (
        <div
          className="avatar-guide"
          style={
            avatar
              ? {
                  left: (avatar.x / geometry.width) * 100 + "%",
                  top: (avatar.y / geometry.height) * 100 + "%",
                  bottom: "auto",
                  width: (avatar.width / geometry.width) * 100 + "%",
                  height: (avatar.height / geometry.height) * 100 + "%",
                }
              : undefined
          }
        >
          <span>{t("safeAvatar")}</span>
        </div>
      )}
    </div>
  );
}
