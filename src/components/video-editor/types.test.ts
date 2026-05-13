import { describe, expect, it } from "vitest";
import { deriveNextId } from "./projectPersistence";

import {
	extendAutoFullTrackClip,
	findClipAtTimelineTime,
	getTimelineDurationMs,
	mapSourceTimeToTimelineTime,
	mapTimelineTimeToSourceTime,
	rippleDeleteClip,
	trimsToClips,
} from "./types";

describe("extendAutoFullTrackClip", () => {
	it("extends the default full-track clip when metadata duration grows", () => {
		expect(
			extendAutoFullTrackClip(
				[{ id: "clip-1", startMs: 0, endMs: 5_000, speed: 1 }],
				"clip-1",
				5_000,
				8_000,
			),
		).toEqual([{ id: "clip-1", startMs: 0, endMs: 8_000, speed: 1 }]);
	});

	it("does not change a clip that no longer matches the auto-created shape", () => {
		expect(
			extendAutoFullTrackClip(
				[{ id: "clip-1", startMs: 0, endMs: 4_000, speed: 1.5 }],
				"clip-1",
				5_000,
				8_000,
			),
		).toBeNull();
	});

	it("does not change multi-clip timelines", () => {
		expect(
			extendAutoFullTrackClip(
				[
					{ id: "clip-1", startMs: 0, endMs: 3_000, speed: 1 },
					{ id: "clip-2", startMs: 4_000, endMs: 8_000, speed: 1 },
				],
				"clip-1",
				8_000,
				10_000,
			),
		).toBeNull();
	});

	it("does not change clips when the duration does not grow", () => {
		expect(
			extendAutoFullTrackClip(
				[{ id: "clip-1", startMs: 0, endMs: 8_000, speed: 1 }],
				"clip-1",
				8_000,
				8_000,
			),
		).toBeNull();
	});

	it("does not change clips when the auto-created clip id is missing", () => {
		expect(
			extendAutoFullTrackClip(
				[{ id: "clip-1", startMs: 0, endMs: 5_000, speed: 1 }],
				null,
				5_000,
				8_000,
			),
		).toBeNull();
	});

	it("does not change clips when the previous auto-created end time is missing", () => {
		expect(
			extendAutoFullTrackClip(
				[{ id: "clip-1", startMs: 0, endMs: 5_000, speed: 1 }],
				"clip-1",
				null,
				8_000,
			),
		).toBeNull();
	});

	it("does not change clips when the reported duration shrinks", () => {
		expect(
			extendAutoFullTrackClip(
				[{ id: "clip-1", startMs: 0, endMs: 8_000, speed: 1 }],
				"clip-1",
				8_000,
				7_000,
			),
		).toBeNull();
	});

	it("does not change clips when the tracked clip id no longer matches", () => {
		expect(
			extendAutoFullTrackClip(
				[{ id: "clip-1", startMs: 0, endMs: 5_000, speed: 1 }],
				"clip-2",
				5_000,
				8_000,
			),
		).toBeNull();
	});

	it("does not change clips when the clip no longer starts at zero", () => {
		expect(
			extendAutoFullTrackClip(
				[{ id: "clip-1", startMs: 250, endMs: 5_000, speed: 1 }],
				"clip-1",
				5_000,
				8_000,
			),
		).toBeNull();
	});
});

describe("clip timeline mapping", () => {
	const clips = [
		{ id: "clip-1", startMs: 0, endMs: 4_000, speed: 1 },
		{ id: "clip-2", startMs: 6_000, endMs: 8_000, speed: 2 },
	];

	it("maps kept timeline time into source time", () => {
		expect(mapTimelineTimeToSourceTime(1_500, clips)).toBe(1_500);
		expect(mapTimelineTimeToSourceTime(7_000, clips)).toBe(8_000);
	});

	it("snaps timeline gaps to the nearest clip edge", () => {
		expect(mapTimelineTimeToSourceTime(4_300, clips)).toBe(4_000);
		expect(mapTimelineTimeToSourceTime(5_700, clips)).toBe(6_000);
	});

	it("maps kept source time back into timeline time", () => {
		expect(mapSourceTimeToTimelineTime(1_500, clips)).toBe(1_500);
		expect(mapSourceTimeToTimelineTime(8_000, clips)).toBe(7_000);
	});

	it("snaps removed source gaps to the nearest kept boundary", () => {
		expect(mapSourceTimeToTimelineTime(4_200, clips)).toBe(4_000);
		expect(mapSourceTimeToTimelineTime(5_900, clips)).toBe(6_000);
	});

	it("finds clips only inside visible kept spans", () => {
		expect(findClipAtTimelineTime(500, clips)?.id).toBe("clip-1");
		expect(findClipAtTimelineTime(5_000, clips)).toBeNull();
	});

	it("derives the next clip id after converting trim gaps into clip ids", () => {
		const clipsFromTrims = trimsToClips(
			[
				{ id: "trim-gap-1", startMs: 1_000, endMs: 2_000 },
				{ id: "trim-gap-2", startMs: 4_000, endMs: 5_000 },
			],
			6_000,
		);

		expect(clipsFromTrims.map((clip) => clip.id)).toEqual(["clip-1", "clip-2", "clip-3"]);
		expect(deriveNextId("clip", clipsFromTrims.map((clip) => clip.id))).toBe(4);
	});
});

describe("getTimelineDurationMs", () => {
	it("extends the timeline when a slow clip becomes longer than the source duration", () => {
		expect(
			getTimelineDurationMs(
				[{ id: "clip-1", startMs: 0, endMs: 20_000, speed: 0.5 }],
				10_000,
			),
		).toBe(20_000);
	});

	it("keeps the source duration when speed edits make clips shorter", () => {
		expect(
			getTimelineDurationMs(
				[{ id: "clip-1", startMs: 0, endMs: 5_000, speed: 2 }],
				10_000,
			),
		).toBe(10_000);
	});
});

describe("rippleDeleteClip", () => {
	it("removes the selected clip and shifts following timeline items left", () => {
		const result = rippleDeleteClip({
			clipId: "clip-2",
			clipRegions: [
				{ id: "clip-1", startMs: 0, endMs: 4_000, speed: 1 },
				{ id: "clip-2", startMs: 4_000, endMs: 7_000, speed: 1 },
				{ id: "clip-3", startMs: 7_000, endMs: 10_000, speed: 1 },
			],
			zoomRegions: [{ id: "zoom-1", startMs: 7_500, endMs: 8_500, depth: 2, focus: { cx: 0.5, cy: 0.5 } }],
			annotationRegions: [
				{
					id: "annotation-1",
					startMs: 8_000,
					endMs: 9_000,
					type: "text",
					content: "Note",
					position: { x: 50, y: 50 },
					size: { width: 30, height: 20 },
					style: {
						color: "#fff",
						backgroundColor: "transparent",
						fontSize: 32,
						fontFamily: "sans-serif",
						fontWeight: "bold",
						fontStyle: "normal",
						textDecoration: "none",
						textAlign: "center",
						borderRadius: 8,
					},
					zIndex: 1,
				},
			],
			speedRegions: [{ id: "speed-1", startMs: 8_000, endMs: 9_000, speed: 2 }],
			audioRegions: [
				{
					id: "audio-1",
					startMs: 9_000,
					endMs: 10_000,
					audioPath: "track.wav",
					volume: 1,
				},
			],
		});

		expect(result).not.toBeNull();
		expect(result?.deletedClipDurationMs).toBe(3_000);
		expect(result?.clipRegions).toEqual([
			{ id: "clip-1", startMs: 0, endMs: 4_000, speed: 1 },
			{ id: "clip-3", startMs: 4_000, endMs: 7_000, speed: 1 },
		]);
		expect(result?.zoomRegions).toEqual([
			{ id: "zoom-1", startMs: 4_500, endMs: 5_500, depth: 2, focus: { cx: 0.5, cy: 0.5 } },
		]);
		expect(result?.annotationRegions[0]?.startMs).toBe(5_000);
		expect(result?.annotationRegions[0]?.endMs).toBe(6_000);
		expect(result?.speedRegions[0]).toEqual({ id: "speed-1", startMs: 5_000, endMs: 6_000, speed: 2 });
		expect(result?.audioRegions[0]?.startMs).toBe(6_000);
		expect(result?.audioRegions[0]?.endMs).toBe(7_000);
	});

	it("removes overlapping child regions and trims cross-boundary regions", () => {
		const result = rippleDeleteClip({
			clipId: "clip-2",
			clipRegions: [
				{ id: "clip-1", startMs: 0, endMs: 4_000, speed: 1 },
				{ id: "clip-2", startMs: 4_000, endMs: 7_000, speed: 1 },
				{ id: "clip-3", startMs: 7_000, endMs: 9_000, speed: 1 },
			],
			zoomRegions: [
				{ id: "zoom-left", startMs: 3_000, endMs: 5_000, depth: 2, focus: { cx: 0.5, cy: 0.5 } },
				{ id: "zoom-right", startMs: 6_000, endMs: 8_000, depth: 3, focus: { cx: 0.2, cy: 0.4 } },
				{ id: "zoom-span", startMs: 3_000, endMs: 8_000, depth: 4, focus: { cx: 0.7, cy: 0.8 } },
			],
			annotationRegions: [],
			speedRegions: [],
			audioRegions: [],
		});

		expect(result?.zoomRegions).toEqual([
			{ id: "zoom-left", startMs: 3_000, endMs: 4_000, depth: 2, focus: { cx: 0.5, cy: 0.5 } },
			{ id: "zoom-right", startMs: 4_000, endMs: 5_000, depth: 3, focus: { cx: 0.2, cy: 0.4 } },
			{ id: "zoom-span", startMs: 3_000, endMs: 5_000, depth: 4, focus: { cx: 0.7, cy: 0.8 } },
		]);
	});
});
