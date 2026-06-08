import json

cols, rows = 18, 14
nodes = []
connections = []
styles = ["default", "text", "note", "warning"]

idx = 0
for y in range(rows):
    for x in range(cols):
        nodes.append(
            {
                "id": f"n{idx}",
                "x": x * 220,
                "y": y * 140,
                "text": f"Node {idx} sample {x}-{y}",
                "style": styles[idx % len(styles)],
            }
        )
        idx += 1

for y in range(rows):
    for x in range(cols):
        i = y * cols + x
        from_id = f"n{i}"
        if x < cols - 1:
            connections.append(
                {
                    "id": f"c-h-{i}",
                    "fromId": from_id,
                    "toId": f"n{i + 1}",
                    "text": f"H {i}" if i % 3 == 0 else "",
                    "style": ["forward", "both", "none", "backward"][i % 4],
                    "curveBend": 0.35 if i % 5 == 0 else 0,
                }
            )
        if y < rows - 1:
            connections.append(
                {
                    "id": f"c-v-{i}",
                    "fromId": from_id,
                    "toId": f"n{i + cols}",
                    "text": f"V {i}" if i % 4 == 0 else "",
                    "style": ["forward", "forward", "both", "none"][i % 4],
                    "curveBend": -0.25 if i % 6 == 0 else 0,
                }
            )
        if x < cols - 2 and y < rows - 1 and i % 5 == 0:
            connections.append(
                {
                    "id": f"c-d-{i}",
                    "fromId": from_id,
                    "toId": f"n{i + cols + 2}",
                    "text": f"D {i}",
                    "style": "forward",
                    "curveBend": 0.45,
                }
            )

with open("perf-large-graph.json", "w", encoding="utf-8") as file:
    json.dump(
        {
            "version": 1,
            "nodes": nodes,
            "connections": connections,
            "canvasOffset": {"x": 200, "y": 120},
            "canvasScale": 0.75,
            "defaultOffset": 100,
        },
        file,
        ensure_ascii=False,
        indent=2,
    )

print("perf-large-graph.json", len(nodes), len(connections))
