import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type ScrollVariant = "teal" | "slate";

const variantColors: Record<
  ScrollVariant,
  { track: string; thumb: string; thumbHover: string }
> = {
  teal: {
    track: "bg-[#d9e1e8]/30",
    thumb: "bg-gradient-to-b from-[#14b8a6]/50 to-[#0f766e]/45",
    thumbHover: "hover:from-[#14b8a6]/68 hover:to-[#0f766e]/60",
  },
  slate: {
    track: "bg-[#cbd5e1]/25",
    thumb: "bg-[#64748b]/40",
    thumbHover: "hover:bg-[#475569]/52",
  },
};

function resolveScrollEl(getScrollElement: (() => HTMLElement | null) | null) {
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const pollRef = useRef<number>();

  useEffect(() => {
    if (!getScrollElement) {
      return;
    }
    pollRef.current = 0;
    const poll = () => {
      const el = getScrollElement();
      if (el) {
        setScrollEl(el);
        return;
      }
      pollRef.current = window.requestAnimationFrame(poll);
    };
    pollRef.current = window.requestAnimationFrame(poll);
    return () => {
      if (pollRef.current) window.cancelAnimationFrame(pollRef.current);
    };
  }, []);

  return scrollEl;
}

function useScrollTracker(getScrollElement: () => HTMLElement | null) {
  const [thumbStyle, setThumbStyle] = useState<CSSProperties>({
    height: 0,
    opacity: 0,
  });
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ y: 0, scrollTop: 0 });

  const computeThumb = useCallback((el: HTMLElement) => {
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) {
      setThumbStyle({ height: 0, opacity: 0 });
      return;
    }
    const trackHeight = clientHeight - 6;
    const ratio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(ratio * trackHeight, 28);
    const maxTop = trackHeight - thumbHeight;
    const top = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setThumbStyle({
      height: thumbHeight,
      transform: `translateY(${top}px)`,
      opacity: 1,
    });
  }, []);

  const showTrack = useCallback(() => {
    setVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    const el = getScrollElement();
    if (el) computeThumb(el);
  }, [computeThumb, getScrollElement]);

  const hideTrack = useCallback(() => {
    if (draggingRef.current) return;
    hideTimerRef.current = setTimeout(() => setVisible(false), 1000);
  }, []);

  const thumbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = getScrollElement();
      if (!el) return;
      draggingRef.current = true;
      dragStartRef.current = { y: e.clientY, scrollTop: el.scrollTop };
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        const el2 = getScrollElement();
        if (!el2) return;
        const dy = ev.clientY - dragStartRef.current.y;
        const { scrollHeight, clientHeight } = el2;
        const trackHeight = clientHeight - 6;
        const ratio = clientHeight / scrollHeight;
        const thumbHeight = Math.max(ratio * trackHeight, 28);
        const maxScrollTop = scrollHeight - clientHeight;
        const maxDragY = trackHeight - thumbHeight;
        const scrollRatio = maxScrollTop / (maxDragY || 1);
        el2.scrollTop = dragStartRef.current.scrollTop + dy * scrollRatio;
      };

      const onMouseUp = () => {
        draggingRef.current = false;
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [getScrollElement],
  );

  const trackClick = useCallback(
    (e: React.MouseEvent) => {
      const el = getScrollElement();
      if (!el) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const { scrollHeight, clientHeight } = el;
      const trackHeight = clientHeight - 6;
      const ratio = clientHeight / scrollHeight;
      const thumbHeight = Math.max(ratio * trackHeight, 28);
      const maxScrollTop = scrollHeight - clientHeight;
      const maxClickY = trackHeight - thumbHeight;
      const targetRatio = Math.max(0, Math.min(1, clickY / maxClickY));
      el.scrollTop = targetRatio * maxScrollTop;
    },
    [getScrollElement],
  );

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return {
    thumbStyle,
    trackVisible: visible || draggingRef.current,
    showTrack,
    hideTrack,
    thumbMouseDown,
    trackClick,
    computeThumb,
  };
}

export function CustomScrollbar({
  children,
  className = "",
  variant = "teal",
}: {
  children: ReactNode;
  className?: string;
  variant?: ScrollVariant;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => containerRef.current, []);
  const {
    thumbStyle,
    trackVisible,
    showTrack,
    hideTrack,
    thumbMouseDown,
    trackClick,
    computeThumb,
  } = useScrollTracker(getScrollElement);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    computeThumb(el);
    const onScroll = () => {
      showTrack();
      computeThumb(el);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => computeThumb(el));
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [computeThumb, showTrack]);

  const colors = variantColors[variant];

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={showTrack}
      onMouseMove={showTrack}
      onMouseLeave={hideTrack}
    >
      <div
        ref={containerRef}
        className="custom-scrollbar-container h-full w-full overflow-auto"
        style={
          {
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          } as React.CSSProperties
        }
      >
        {children}
      </div>
      <div
        className={`custom-scrollbar-track absolute right-[3px] top-[3px] bottom-[3px] z-10 w-[7px] rounded-full transition-opacity duration-300 ${
          colors.track
        } ${trackVisible ? "opacity-100" : "opacity-0"}`}
        onClick={trackClick}
      >
        <div
          className={`custom-scrollbar-thumb absolute inset-x-0 rounded-full cursor-pointer transition-[width] duration-150 ${colors.thumb} ${colors.thumbHover} hover:w-[11px] hover:-right-[2px]`}
          style={thumbStyle}
          onMouseDown={thumbMouseDown}
        />
      </div>
    </div>
  );
}

export function ScrollbarTrack({
  variant = "teal",
  getScrollElement,
}: {
  variant?: ScrollVariant;
  getScrollElement: () => HTMLElement | null;
}) {
  const stableGetRef = useRef(getScrollElement);
  stableGetRef.current = getScrollElement;
  const stableGet = useCallback(() => stableGetRef.current(), []);

  const scrollEl = resolveScrollEl(stableGet);

  const containerRef = useRef<HTMLDivElement>(null);
  const {
    thumbStyle,
    trackVisible,
    showTrack,
    hideTrack,
    thumbMouseDown,
    trackClick,
    computeThumb,
  } = useScrollTracker(stableGet);

  useEffect(() => {
    if (!scrollEl) return;
    computeThumb(scrollEl);
    const onScroll = () => {
      showTrack();
      computeThumb(scrollEl);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => computeThumb(scrollEl));
    observer.observe(scrollEl);
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [scrollEl, computeThumb, showTrack]);

  const colors = variantColors[variant];

  return (
    <div
      ref={containerRef}
      className={`custom-scrollbar-overlay absolute right-[3px] top-[3px] bottom-[3px] z-10 w-[7px] rounded-full transition-opacity duration-300 pointer-events-auto ${
        colors.track
      } ${trackVisible ? "opacity-100" : "opacity-0"}`}
      onClick={trackClick}
      onMouseEnter={showTrack}
      onMouseMove={showTrack}
      onMouseLeave={hideTrack}
    >
      <div
        className={`custom-scrollbar-thumb absolute inset-x-0 rounded-full cursor-pointer transition-[width] duration-150 ${colors.thumb} ${colors.thumbHover} hover:w-[11px] hover:-right-[2px]`}
        style={thumbStyle}
        onMouseDown={thumbMouseDown}
      />
    </div>
  );
}
