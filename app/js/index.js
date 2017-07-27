import storyflow, {NOT_EXSITS} from "../../src/js/story-flow";
import axios from "axios";
import X2JS from "x2js";

axios.get("../test/Data/matrix.xml").then((d) => {
    let data = readFromXML(d.data);
    console.log(data);
    let generator = storyflow();
    generator(data);
});
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
        sessionTable = new Map();
    let data = parser.xml2js(xml);
    if (data !== undefined) {
        // this requires data with single root "All"
        // if not, wo create a dummy root
        let locations = data.Story.Locations;
        if (locations !== undefined) {
            let root = locations.Location;
            if (Array.isArray(root)) {
                root = {};
                root.Location = locations.Location;
                root.Sessions = String(NOT_EXSITS);
                root.Name = "dummy";
            }
            locationTree = constructLocationTree(root);
        }
    }
    // characters array, add entities to SessionTable
    let characters = data.Story.Characters.Character;
    if (characters !== undefined) {
        if (!Array.isArray(characters)) {
            characters = [characters];
        }
        sessionTable = constructSessionTable(characters);
    }

    return {
        locationTree: locationTree,
        sessionTable: sessionTable
    };

    function constructSessionTable(characters) {
        let result = new Map();
        for (let character of characters) {
            // just give it an alias but not copy
            character.sessions = character.Span;
            for (let session of character.sessions) {
                let sessionId = Number(session.Session);
                let entityInfo = {
                    start: Number(session.Start),
                    end: Number(session.End),
                    entity: character.Name
                };
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
        if (root.sessions === [""]) {
            root.sessions = [];
        } else {
            root.sessions = root.sessions.map((v) => Number(v));
        }
        // use name as id
        root.name = root.Name;
        root.visible = Boolean(root.Visible);
        let children = root.Location;
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