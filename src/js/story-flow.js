import {
    max
} from "d3-array";
import X2JS from "x2js";



function sweepOrder(relationshipTrees) {

}

function buildInitialRelationshipTree(sessionTable, locationTree) {

}
// read in xml string and return location tree and session table
export function data(xml) {
    const parser = new X2JS({
        attributePrefix: ""
    });
    let locationTree = {},
        sessionTable = {};
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
                root.Sessions = "-1";
                root.Name = "dummy";
                root.Id = "-1";
            }
            constructLocationTree(root);
        }
    }
    // characters array, add entities to SessionTable
    let characters = data.Story.Characters.Character;
    if (characters !== undefined) {
        if (!Array.isArray(characters)) {
            characters = [characters];
        }
        constructSessionTable(characters);
    }

    console.log(data);
    console.log(sessionTable);
    console.log(locationTree);

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
        sessionTable = result;
    }

    function constructLocationTree(root) {
        if (root === undefined) {
            return;
        }
        root.sessions = root.Sessions.split(",").map((v) => Number(v));
        root.id = Number(root.Id);
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
        locationTree = root;
    }
}

function calculateCrossings(locations, location, index, sessionTable) {
    // find interset
    for (let location of locations) {
        for (let session of location.sessions) {

        }
    }
}

// locationTree here must have children
// sort in same level 
function sortLocationChildren(locationTree, sessionTable) {
    if (locationTree === undefined || !Array.isArray(locationTree.children) || locationTree.children.length === 0) {
        return [];
    }
    calculateTotalEntityNum(locationTree, sessionTable, false);
    let children = locationTree.children;
    children.sort((a, b) => b.entities.length - a.entities.length);
    let result = [];
    result.push(children[0]);
    children.shift();
    for (let child of children) {
        // let initial big enough
        let minCrossing = Number.MAX_SAFE_INTEGER;
        let targetIndex = 0;
        for (var i = 0; i < result.length; i++) {
            let crossing = calculateCrossings(result, child, i, sessionTable);
            // If there is more than one position that introduces the same crossing number, 
            // we select the top one.
            if (crossing < minCrossing) {
                minCrossing = crossing;
                targetIndex = i;
            }
        }
        // insert at targetIndex
        result.splice(targetIndex, 0, child);
    }
    return result;
}
// Each tree node
// represents a location and includes all the session IDs that occur at the
// location.
// including children's 
// SessionId -> time span and entity
// this function add an array of entities 
function calculateTotalEntityNum(locationTree, sessionTable, forced) {
    // already calculated and not forced to update
    if (Array.isArray(locationTree.entities) && !forced) {
        return locationTree.entities.length;
    }
    let result = [];
    if (Array.isArray(locationTree.children)) {
        // non-leaf add their chilren's entities  
        for (let child of locationTree.children) {
            calculateTotalEntityNum(child, sessionTable, forced);
            for (let entity of child.entities) {
                if (result.indexOf(entity) === -1) {
                    result.push(entity);
                }
            }
        }
    }
    for (let sessionId of locationTree.sessions) {
        let entity = sessionTable.get(sessionId).entity;
        if (result.indexOf(entity) === -1) {
            result.push(entity);
        }
    }
    locationTree.entities = result;
    return result.length;
}

function sortLocationTree(locationTree, sessionTable) {
    // recursion exit
    // current is undefined or has no child
    if (locationTree === undefined || !(Array.isArray(locationTree.children))) {
        return;
    }
    // dfs sorting
    // if has children

    for (let child of locationTree.children) {
        sortLocationTree(child, sessionTable);
    }
    locationTree.children = sortLocationChildren(locationTree, sessionTable);
}