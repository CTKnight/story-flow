import * as d3 from "d3";
import "d3-selection-multi";
import storyflowlinkHorizontal from "../../src/js/linkHorizontal";

export function draw() {
    let svg = d3.select("svg"),
        width = +svg.attr("width"),
        height = +svg.attr("height");


    let selection = svg.selectAll(".links");

    let circleSelection = svg.selectAll(".scircle");

    let dcircleSelection = svg.selectAll(".dcircle");

    const initArray = [{
        source: {
            x: 10,
            y: 100
        },
        target: {
            x: 100,
            y: 0
        }
    }, {
        source: {
            x: 10,
            y: 200
        },
        target: {
            x: 400,
            y: 400
        }
    }];

    const linkAttr = {
        "d": storyflowlinkHorizontal(),
        "stroke-width": 1,
        "class": "links"
    };

    updateView();

    initArray.push({
        source: {
            x: 200,
            y: 200
        },
        target: {
            x: 300,
            y: 400
        }
    });
    // initArray.shift();

    updateView();

    function updateView() {

        // update selection to all
        selection = selection.data(initArray)
            .enter()
            .append("path").merge(selection)
            .attrs(linkAttr);

        selection.exit().transition().remove();

        const circleAttr = circleAttrGen(d => d.source, "scircle");

        circleSelection = circleSelection.data(initArray).enter()
            .append("circle").merge(circleSelection)
            .attrs(circleAttr)
            .call(d3.drag().on("drag", onDragGenerator(d => d.source)));

        circleSelection.exit().remove();

        const dcircleAttr = circleAttrGen(d => d.target, "dcircle");

        dcircleSelection = dcircleSelection.data(initArray).enter()
            .append("circle").merge(dcircleSelection)
            .attrs(dcircleAttr)
            .call(d3.drag().on("drag", onDragGenerator(d => d.target)));

        dcircleSelection.exit().remove();

        function onDragGenerator(targetFunction) {
            return onDrag;

            function onDrag(d) {
                targetFunction(d).x = d3.event.x;
                targetFunction(d).y = d3.event.y;
                updateView();
            }
        }

        function circleAttrGen(targetFunction, clazz) {
            return {
                "class": "circle " + clazz,
                "r": 10,
                "cx": d => targetFunction(d).x,
                "cy": d => targetFunction(d).y
            };
        }
    }
}