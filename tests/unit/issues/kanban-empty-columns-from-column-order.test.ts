/**
 * Regression coverage: Kanban empty columns from saved column order.
 *
 * When hideEmptyColumns is false, the kanban view should display columns for
 * all values defined in the saved columnOrder, even if no tasks currently have
 * that value. The existing augmentWithEmptyStatusColumns and
 * augmentWithEmptyPriorityColumns methods only handle built-in fields. Custom
 * user fields (e.g. gtdStatus) rely on augmentWithEmptyColumnsFromColumnOrder
 * as a general-purpose fallback.
 */

import { describe, it, expect } from "@jest/globals";

interface MockTaskInfo {
	path: string;
	title: string;
	gtdStatus?: string;
}

/**
 * Simulates augmentWithEmptyColumnsFromColumnOrder from KanbanView.
 * Uses the same key lookup and guard logic as the real implementation.
 */
function augmentWithEmptyColumnsFromColumnOrder(
	groups: Map<string, MockTaskInfo[]>,
	groupByPropertyId: string,
	columnOrders: Record<string, string[]>
): void {
	const savedOrder = columnOrders[groupByPropertyId];
	if (!savedOrder || !Array.isArray(savedOrder) || savedOrder.length === 0) {
		return;
	}

	for (const columnKey of savedOrder) {
		if (!groups.has(columnKey)) {
			groups.set(columnKey, []);
		}
	}
}

describe("augmentWithEmptyColumnsFromColumnOrder", () => {
	it("should create empty columns for values in columnOrder not present in groups", () => {
		const groups = new Map<string, MockTaskInfo[]>();
		groups.set("inbox", [{ path: "task1.md", title: "Task 1", gtdStatus: "inbox" }]);
		groups.set("in-progress", [
			{ path: "task2.md", title: "Task 2", gtdStatus: "in-progress" },
		]);

		const columnOrders: Record<string, string[]> = {
			"note.gtdStatus": [
				"inbox",
				"backlog",
				"sprint-backlog",
				"in-progress",
				"blocked",
				"done",
			],
		};

		augmentWithEmptyColumnsFromColumnOrder(groups, "note.gtdStatus", columnOrders);

		// All columnOrder values should now exist as groups
		expect(groups.has("inbox")).toBe(true);
		expect(groups.has("backlog")).toBe(true);
		expect(groups.has("sprint-backlog")).toBe(true);
		expect(groups.has("in-progress")).toBe(true);
		expect(groups.has("blocked")).toBe(true);
		expect(groups.has("done")).toBe(true);

		// Empty columns should have empty arrays
		expect(groups.get("backlog")).toEqual([]);
		expect(groups.get("sprint-backlog")).toEqual([]);
		expect(groups.get("blocked")).toEqual([]);
		expect(groups.get("done")).toEqual([]);
	});

	it("should not overwrite existing groups that already have tasks", () => {
		const task1: MockTaskInfo = { path: "task1.md", title: "Task 1", gtdStatus: "inbox" };
		const groups = new Map<string, MockTaskInfo[]>();
		groups.set("inbox", [task1]);

		const columnOrders: Record<string, string[]> = {
			"note.gtdStatus": ["inbox", "backlog"],
		};

		augmentWithEmptyColumnsFromColumnOrder(groups, "note.gtdStatus", columnOrders);

		// Existing group should be untouched
		expect(groups.get("inbox")).toEqual([task1]);
		// New empty column should be created
		expect(groups.get("backlog")).toEqual([]);
	});

	it("should be a no-op when no saved order exists for the groupBy property", () => {
		const groups = new Map<string, MockTaskInfo[]>();
		groups.set("inbox", [{ path: "task1.md", title: "Task 1" }]);

		const columnOrders: Record<string, string[]> = {
			"note.priority": ["high", "medium", "low"],
		};

		augmentWithEmptyColumnsFromColumnOrder(groups, "note.gtdStatus", columnOrders);

		// Only the original group should exist
		expect(groups.size).toBe(1);
		expect(groups.has("inbox")).toBe(true);
	});

	it("should be a no-op when saved order is an empty array", () => {
		const groups = new Map<string, MockTaskInfo[]>();
		groups.set("inbox", [{ path: "task1.md", title: "Task 1" }]);

		const columnOrders: Record<string, string[]> = {
			"note.gtdStatus": [],
		};

		augmentWithEmptyColumnsFromColumnOrder(groups, "note.gtdStatus", columnOrders);

		expect(groups.size).toBe(1);
	});

	it("should be defensive against non-array saved order", () => {
		const groups = new Map<string, MockTaskInfo[]>();
		groups.set("inbox", [{ path: "task1.md", title: "Task 1" }]);

		// Simulate corrupted config where value is a string instead of array
		const columnOrders = {
			"note.gtdStatus": "not-an-array" as unknown as string[],
		};

		// Should not throw
		expect(() => {
			augmentWithEmptyColumnsFromColumnOrder(groups, "note.gtdStatus", columnOrders);
		}).not.toThrow();

		// Groups should be unchanged
		expect(groups.size).toBe(1);
	});
});

describe("columnOrder config parsing", () => {
	/**
	 * Simulates the config loading logic from KanbanView.readViewOptions().
	 */
	function parseColumnOrder(
		raw: unknown,
		groupByPropertyId: string | null
	): Record<string, string[]> {
		if (typeof raw === "string") {
			try {
				return JSON.parse(raw);
			} catch {
				return {};
			}
		} else if (Array.isArray(raw)) {
			if (groupByPropertyId) {
				return { [groupByPropertyId]: raw };
			} else {
				return {};
			}
		} else if (raw && typeof raw === "object") {
			return raw as Record<string, string[]>;
		} else {
			return {};
		}
	}

	it("should parse JSON string format", () => {
		const raw = '{"note.gtdStatus":["inbox","backlog","done"]}';
		const result = parseColumnOrder(raw, "note.gtdStatus");
		expect(result).toEqual({ "note.gtdStatus": ["inbox", "backlog", "done"] });
	});

	it("should handle YAML array format with groupBy property", () => {
		const raw = ["backlog", "inbox", "done"];
		const result = parseColumnOrder(raw, "note.gtdStatus");
		expect(result).toEqual({ "note.gtdStatus": ["backlog", "inbox", "done"] });
	});

	it("should handle YAML array format without groupBy property", () => {
		const raw = ["backlog", "inbox", "done"];
		const result = parseColumnOrder(raw, null);
		expect(result).toEqual({});
	});

	it("should handle already-parsed object format", () => {
		const raw = { "note.gtdStatus": ["inbox", "done"] };
		const result = parseColumnOrder(raw, "note.gtdStatus");
		expect(result).toEqual({ "note.gtdStatus": ["inbox", "done"] });
	});

	it("should handle invalid JSON string gracefully", () => {
		const raw = "{broken json";
		const result = parseColumnOrder(raw, "note.gtdStatus");
		expect(result).toEqual({});
	});

	it("should handle null/undefined gracefully", () => {
		expect(parseColumnOrder(null, "note.gtdStatus")).toEqual({});
		expect(parseColumnOrder(undefined, "note.gtdStatus")).toEqual({});
	});
});
