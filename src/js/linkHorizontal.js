import {linkHorizontal} from "d3-shape";

export default function() {
    return linkHorizontal()
    .x(d => d.x)
    .y(d => d.y);
}