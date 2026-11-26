import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactElement,
  type MouseEvent,
} from "react";
import Popper from "@mui/material/Popper";
import Fade from "@mui/material/Fade";
import "./tip.css";

type Props = {
  html: string;
  children: ReactElement<{
    onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
    "aria-describedby"?: string;
  }>;
  disabled?: boolean;
  placement?: "right-start" | "left-start" | "top" | "bottom";
};

/** 富文本 tip：滚动/滚轮/失焦即关 */
export function RichTooltip({
  html,
  children,
  disabled,
  placement = "right-start",
}: Props) {
  const tipId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor) && !disabled && !!html;

  const hide = useCallback(() => setAnchor(null), []);

  useEffect(() => {
    if (!open) return;
    const onHide = () => hide();
    document.addEventListener("scroll", onHide, true);
    document.addEventListener("wheel", onHide, { capture: true, passive: true });
    window.addEventListener("blur", onHide);
    const onVis = () => {
      if (document.hidden) onHide();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("scroll", onHide, true);
      document.removeEventListener("wheel", onHide, true);
      window.removeEventListener("blur", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [open, hide]);

  const trigger = cloneElement(children, {
    "aria-describedby": open ? tipId : undefined,
    onMouseEnter: (e: MouseEvent<HTMLElement>) => {
      children.props.onMouseEnter?.(e);
      if (!disabled) setAnchor(e.currentTarget);
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
      children.props.onMouseLeave?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      <Popper
        id={tipId}
        open={open}
        anchorEl={anchor}
        placement={placement}
        transition
        modifiers={[
          { name: "offset", options: { offset: [0, 10] } },
          { name: "preventOverflow", options: { padding: 8 } },
        ]}
        style={{ zIndex: 1400, pointerEvents: "none" }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={0}>
            <div
              className="wga-rich-tip"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </Fade>
        )}
      </Popper>
    </>
  );
}
