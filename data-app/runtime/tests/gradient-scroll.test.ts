import { expect, test } from "bun:test";
import { scrollFadeEdges } from "../src/react/ui/GradientScroll.tsx";

const metrics = {
  scrollTop: 0,
  scrollHeight: 600,
  clientHeight: 200,
  scrollLeft: 0,
  scrollWidth: 600,
  clientWidth: 200,
};

test("scroll fades show only edges with more reachable content", () => {
  expect(scrollFadeEdges(metrics, "vertical")).toEqual({ start: false, end: true });
  expect(scrollFadeEdges({ ...metrics, scrollTop: 180 }, "vertical")).toEqual({
    start: true,
    end: true,
  });
  expect(scrollFadeEdges({ ...metrics, scrollTop: 400 }, "vertical")).toEqual({
    start: true,
    end: false,
  });
  expect(scrollFadeEdges({ ...metrics, scrollHeight: 200 }, "vertical")).toEqual({
    start: false,
    end: false,
  });
  expect(scrollFadeEdges({ ...metrics, scrollLeft: 400 }, "horizontal")).toEqual({
    start: true,
    end: false,
  });
});
