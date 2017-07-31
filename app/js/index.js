import storyflow from "../../src/js/story-flow";
import axios from "axios";
import X2JS from "x2js";

// axios.get("../test/Data/matrix.xml").then((d) => {
//     let data = readFromXML(d.data);
//     let generator = storyflow();
//     console.log(data);
//     generator(data);
// });
axios.get("../test/Data/LetBulletFly.xml").then((d) => {
    let data = readFromXML(d.data);
    console.log(data);
    let generator = storyflow();
    generator(data);
});

const parser = new X2JS({
    attributePrefix: ""
});


// read in xml string and return location tree and session table
let readFromXML = function (xml) {
    let locationTree = {},
        sessionTable = new Map(),
        minTimeframe = Number.MAX_SAFE_INTEGER,
        maxTimeframe = Number.MIN_SAFE_INTEGER;
    let data = parser.xml2js(xml);
    if (data !== undefined) {
        // characters array, add entities to SessionTable
        let characters = data.Story.Characters.Character;
        if (characters !== undefined) {
            if (!Array.isArray(characters)) {
                characters = [characters];
            }
            sessionTable = constructSessionTable(characters);
        }
        // this requires data with single root "All"
        // if not, wo create a dummy root
        let locations = data.Story.Locations;
        if (locations !== undefined) {
            let root = locations.Location;
            if (Array.isArray(root)) {
                root = {};
                root.Location = locations.Location;
                root.Sessions = "";
                root.Name = "dummy";
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
        for (let character of characters) {
            // just give it an alias but not copy
            character.sessions = character.Span;
            for (let session of character.sessions) {
                let sessionId = Number(session.Session);
                session.sessionId = sessionId;
                session.start = Number(session.Start);
                session.end = Number(session.End);

                let entityInfo = {
                    start: session.start,
                    end: session.end,
                    entity: character.Name
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

    function constructLocationTree(root) {
        if (root === undefined) {
            return;
        }
        root.sessions = root.Sessions.split(",");
        if (root.Sessions === "") {
            // otherwise "" results in [0] which is unexpected
            root.sessions = [];
        } else {
            root.sessions = root.sessions.map((v) => Number(v));
        }
        delete root.Sessions;
        // use name as id
        root.name = root.Name;
        delete root.Name;
        root.visible = Boolean(root.Visible);
        delete root.Visible;
        let children = root.Location;
        // remove Location member reference
        delete root.Location;
        if (children === undefined) {
            locationTree = root;
            return;
        }
        if (!Array.isArray(children)) {
            // single child
            root.children = [children];
        } else {
            root.children = children;
        }
        for (let child of root.children) {
            constructLocationTree(child);
        }
        return root;
    }
};