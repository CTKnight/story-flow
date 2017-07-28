// for some special cases like dummy head
export const NOT_EXSITS = -1;

function defaultGetLocationTree(data) {
    return data.locationTree;
}

function defaultGetSessionTable(data) {
    return data.sessionTable;
}

function defaultInvertedIndex(data) {
    return data.characterSessionInvertedIndex;
}

function defaultGetWeight(entity) {
    return entity.weight;
}

function hasChildren(_) {
    return !(!Array.isArray(_.children) || _.children.length === 0);
}

export default function () {
    // settings and parameters
    let graph, data;

    function storyFlow() {
        data = {
            locationTree: defaultGetLocationTree.apply(null, arguments),
            sessionTable: defaultGetSessionTable.apply(null, arguments),
            characterSessionInvertedIndex: defaultInvertedIndex.apply(null, arguments)
        };
        update(data);
        // return graph and relationshipTree for UI
        return graph;
    }

    storyFlow.update = update;

    function update(data) {
        sortLocationTree(data.locationTree);
        console.log(data.locationTree);
        let rtree = buildSingleRelationshipTree(30);
        console.log(rtree);
    }


    function sortLocationTree(locationTree) {
        // recursion exit
        // current is undefined or has no child
        if (locationTree === undefined || !hasChildren(locationTree)) {
            return;
        }
        // dfs sorting
        // if has children

        for (let child of locationTree.children) {
            sortLocationTree(child);
        }
        locationTree.children = sortLocationChildren(locationTree);
    }

    // locationTree here must have children
    // sort in same level 
    function sortLocationChildren(locationTree) {
        if (locationTree === undefined || !hasChildren(locationTree)) {
            // earse empty array
            return undefined;
        }
        calculateTotalEntityNum(locationTree, false);
        let children = locationTree.children;
        children.sort((a, b) => b.entities.size - a.entities.size);
        let result = [];
        result.push(children[0]);
        children.shift();
        for (let child of children) {
            // let initial big enough
            let minCrossing = Number.MAX_SAFE_INTEGER;
            let targetIndex = 0;
            for (let i = 0; i <= result.length; i++) {
                let crossing = calculateCrossings(result, child, i);
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
    // this function add a set of entities 
    function calculateTotalEntityNum(locationTree, forced) {
        let sessionTable = data.sessionTable;
        // already calculated and not forced to update
        if (locationTree.entities !== undefined && !forced) {
            return locationTree.entities.length;
        }
        let result = new Set();
        let resultInLevel = new Set();
        if (hasChildren(locationTree)) {
            // non-leaf add their chilren's entities  
            for (let child of locationTree.children) {
                calculateTotalEntityNum(child, forced);
                for (let entity of child.entities) {
                    result.add(entity);
                }
            }
        }
        for (let sessionId of locationTree.sessions) {
            let entitiesInfo = sessionTable.get(sessionId);
            if (entitiesInfo === undefined) {
                // location tree may contain sessions where no entity is there
                entitiesInfo = [];
                sessionTable.set(sessionId, entitiesInfo);
            }
            for (let info of entitiesInfo) {
                result.add(info.entity);
                resultInLevel.add(info.entity);
            }
        }
        locationTree.entities = result;
        locationTree.entitiesInThisLevel = resultInLevel;
        return result.size;
    }

    // at this stage all entities in locations are in a set
    // ignore time span of session because they are almost identical
    // calculate the minimal crossings
    function calculateCrossings(tempResult, location, index) {
        let crossings = 0;
        // crossings above
        // pretend location is at index
        for (let i = index - 1; i >= 0; i--) {
            let locationAbove = tempResult[i];
            locationAbove.entityIntersectionNum = (new Set([...location.entities].filter(x => locationAbove.entities.has(x)))).size;
            let middleCrossings = 0;
            for (let j = index - 1; j > i; j--) {
                // these lines which don't winding to location will cause crossing
                // 
                let locationInMiddle = tempResult[j];
                middleCrossings += (locationInMiddle.entities.size - locationInMiddle.entityIntersectionNum);
            }
            // each of intersect entity will cause a crossing
            middleCrossings *= locationAbove.entityIntersectionNum;
            crossings += middleCrossings;
        }

        // pretend location is at index - 1
        for (let i = index; i <= tempResult.length - 1; i++) {
            let locationBelow = tempResult[i];
            locationBelow.entityIntersectionNum = (new Set([...location.entities].filter(x => locationBelow.entities.has(x)))).size;
            let middleCrossings = 0;
            for (let j = index; j < i; j++) {
                let locationInMiddle = tempResult[j];
                middleCrossings += locationInMiddle.entities.size - locationInMiddle.entityIntersectionNum;
            }

            middleCrossings *= locationBelow.entityIntersectionNum;
            crossings += middleCrossings;

        }
        return crossings;
    }

    function buildSingleRelationshipTree(timeframe) {

        return deepCopyLocationTree(data.locationTree);

        function deepCopyLocationTree(sourceTree) {
            if (sourceTree === undefined) {
                return undefined;
            }
            let targetTree = Object.assign({}, sourceTree);
            // relationship tree node structure :
            // locationNode(already sorted by location tree) || => [sessions at this time] => [entities at this time]
            // entities and sessions are filtered by timeframe
            // entities place in post-order
            targetTree.entitiesInThisLevel = new Set(sourceTree.entitiesInThisLevel);
            targetTree.sessions = sourceTree.sessions.slice();
            let sessionToEntities = new Map();
            targetTree.sessions
                .map((session) => {
                    let infoList = data.sessionTable.get(session);
                    let ret = infoList.filter((info) => info.start <= timeframe && timeframe <= info.end);
                    return {
                        key: session,
                        value: ret
                    };
                })
                .filter((session) =>
                    session.value.length != 0
                )
                .forEach((entry) => 
                sessionToEntities.set(entry.key, entry.value));
            targetTree.sessions = sessionToEntities;


            if (hasChildren(sourceTree)) {
                let tempChildren = [];
                // keep the location tree order here!
                for (let child of sourceTree.children) {
                    tempChildren.push(deepCopyLocationTree(child));
                }
                targetTree.children = tempChildren;
            }
            return targetTree;
        }
    }

    return storyFlow;
}