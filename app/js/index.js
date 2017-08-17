import storyflow from "../../src/js/story-flow";
import * as d3 from "d3";

import {
    draw
} from "./draw";

d3.xml("../test/Data/LetBulletFly.xml", (error, data) => {
    if (error) {
        throw error;
    }
    let generator = storyflow();
    console.time("read");
    data = readFromXML(data);
    console.timeEnd("read");

    console.time("layout");
    generator(data);
    console.timeEnd("layout");
    // draw();
});

// read in xml string and return location tree and session table
function readFromXML(xml) {
    let locationTree = {},
        sessionTable = new Map(),
        minTimeframe = Number.MAX_SAFE_INTEGER,
        maxTimeframe = Number.MIN_SAFE_INTEGER;
    let story = xml.querySelector("Story");
    if (story) {
        // characters array, add entities to SessionTable
        let characters = story.querySelector("Characters");
        if (characters) {
            sessionTable = constructSessionTable(characters);
        }
        // this requires data with single root "All"
        // if not, wo create a dummy root

        // select direct children
        // https://developer.mozilla.org/en-US/docs/Web/CSS/:scope
        let locations = story.querySelector("Locations");
        if (locations) {
            let root = Array.from(locations.children);
            if (root.length !== 1) {
                let tmp = document.createElement("Location");
                tmp.setAttribute("Sessions", "");
                tmp.setAttribute("Name", "dummy");
                for (let element of root) {
                    tmp.appendChild(element);
                }
                root = tmp;
            } else {
                root = root[0];
            }
            locationTree = constructLocationTree(root);
        }
    }

    return {
        locationTree: locationTree,
        sessionTable: sessionTable,
        timeSpan: {
            maxTimeframe: maxTimeframe,
            minTimeframe: minTimeframe
        }
    };

    function constructSessionTable(characters) {
        let result = new Map();
        characters = characters.querySelectorAll("Character");
        for (let character of characters) {
            // just give it an alias but not copy
            character.sessions = character.querySelectorAll("Span");
            for (let session of character.sessions) {
                let sessionId = Number(session.getAttribute("Session"));
                session.sessionId = sessionId;
                session.start = Number(session.getAttribute("Start"));
                session.end = Number(session.getAttribute("End"));

                let entityInfo = {
                    start: session.start,
                    end: session.end,
                    entity: character.getAttribute("Name")
                };
                if (entityInfo.start < minTimeframe) {
                    minTimeframe = entityInfo.start;
                }
                if (entityInfo.end > maxTimeframe) {
                    maxTimeframe = entityInfo.end;
                }
                if (!result.has(sessionId)) {
                    result.set(sessionId, [entityInfo]);
                } else {
                    result.get(sessionId).push(entityInfo);
                }
            }
        }
        return result;
    }

    // construct a copy a tree
    function constructLocationTree(dom) {
        let root = {};
        if (dom === undefined) {
            return;
        }
        let sessions = dom.getAttribute("Sessions");
        root.sessions = sessions.split(",");
        if (sessions === "") {
            // otherwise "" results in [0] which is unexpected
            root.sessions = [];
        } else {
            root.sessions = root.sessions.map((v) => Number(v));
        }
        // use name as id
        root.name = dom.getAttribute("Name");
        root.visible = Boolean(dom.getAttribute("Visible"));

        root.children = [];
        for (let child of dom.children) {
            root.children.push(constructLocationTree(child));
        }
        return root;
    }
}