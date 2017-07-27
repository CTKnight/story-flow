// for some special cases like dummy head
export const NOT_EXSITS = -1;

function defaultGetLocationTree(data) {
    return data.locationTree;
}

function defaultGetSessionTable(data) {
    return data.sessionTable;
}

function defaultGetWeight(entity) {
    return entity.weight;
}

export default function () {
    // settings and parameters
    let graph, data;
    function storyFlow() {
        data = {locationTree: defaultGetLocationTree.apply(null, arguments), sessionTable:defaultGetSessionTable.apply(null, arguments)};
        update(data);
        // return graph and relationshipTree for UI
        return graph;
    }

    storyFlow.update = update;

    function update(data) {
        sortLocationTree(data.locationTree);
        console.log(data);
    }

    
    function sortLocationTree(locationTree) { 
        // recursion exit
        // current is undefined or has no child
        if (locationTree === undefined || !(Array.isArray(locationTree.children))) {
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
        if (locationTree === undefined || !Array.isArray(locationTree.children) || locationTree.children.length === 0) {
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
    // this function add an array of entities 
    function calculateTotalEntityNum(locationTree, forced) {
        let sessionTable = data.sessionTable; 
        // already calculated and not forced to update
        if (Array.isArray(locationTree.entities) && !forced) {
            return locationTree.entities.length;
        }
        let result = new Set();
        if (Array.isArray(locationTree.children)) {
            // non-leaf add their chilren's entities  
            for (let child of locationTree.children) {
                calculateTotalEntityNum(child, forced);
                for (let entity of child.entities) {
                    result.add(entity);
                }
            }
        }
        for (let sessionId of locationTree.sessions) {
            if (sessionId == NOT_EXSITS) {
                continue;
            }
            let entitiesInfo = sessionTable.get(sessionId);
            if (entitiesInfo === undefined) {
                // location tree may contain sessions where no entity is there
                entitiesInfo = [];
                sessionTable.set(sessionId, entitiesInfo);
            }
            for (let info of entitiesInfo) {
                result.add(info.entity);
            }
        }
        locationTree.entities = result;
        return result.size;
    }

    // at this stage all entities in locations are in a set
    // ignore time span of session because they are almost identical
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
                middleCrossings +=  (locationInMiddle.entities.size - locationInMiddle.entityIntersectionNum); 
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
    return storyFlow;
}