// for some special cases like dummy head
const MAX_SORT_LOOP = 20;

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

function defaultTimeSpan(data) {
    return data.timeSpan;
}

function hasChildren(_) {
    return !(!Array.isArray(_.children) || _.children.length === 0);
}

export default function () {
    // settings and parameters
    let graph, data;
    // data: locationTree: TreeNode
    // sessionTable: Map<Int, EntityInfo[]>
    // timeSpan: {maxTimeframe:Int, minTimeframe:Int}
    function storyFlow() {
        data = {
            locationTree: defaultGetLocationTree.apply(null, arguments),
            sessionTable: defaultGetSessionTable.apply(null, arguments),
            timeSpan: defaultTimeSpan.apply(null, arguments)
        };
        update(data);
        // return graph and relationshipTree for UI
        return graph;
    }

    storyFlow.update = update;

    function update(data) {
        sortLocationTree(data.locationTree);
        let sequence = constructRelationshipTreeSequence();
        console.log(sequence);
        sortRelationTreeSequence(sequence);

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
            }
        }
        locationTree.entities = result;
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
            targetTree.sessions = sourceTree.sessions.slice();
            // unnecessary in relationship tree
            delete targetTree.entities;
            let sessionToEntities = new Map();
            targetTree.sessions
                .map((session) => {
                    let infoList = data.sessionTable.get(session);
                    // [start, end) except for maxTimeframe
                    // because the data is  like {start: 0, end: 7}, {start: 7, end: 21}
                    let ret = infoList.filter((info) => (info.start <= timeframe && timeframe < info.end) || (timeframe === data.timeSpan.maxTimeframe && timeframe === info.end));
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

    // calculate entity weights and those of their sessions as reference frame
    // weights of sessions are average of their entities 
    function getEntitiesOrder(relationshipTree) {
        let order = 0;

        // use map to get O(1) access 
        // comparing to arrat.prorotype.indexOf() is O(n)
        let result = new Map();
        calculateWeights(relationshipTree);
        return result;

        function calculateWeights(relationshipTree) {
            // post-order
            if (hasChildren(relationshipTree)) {
                for (let child of relationshipTree.children) {
                    calculateWeights(child);
                }
            }
            // map still preserve input order
            for (let [_, entitiesInfoArray] of relationshipTree.sessions) {
                for (let entitiesInfo of entitiesInfoArray) {
                    // assign to each entity
                    result.set(entitiesInfo.entity, order);
                    order += 1;
                }
            }
        }
    }

    function constructRelationshipTreeSequence() {
        let sequence = [];
        for (let timeframe = data.timeSpan.minTimeframe; timeframe < data.timeSpan.maxTimeframe; timeframe++) {
            sequence.push(buildSingleRelationshipTree(timeframe));
        }
        return sequence;
    }

    // sort sessions and entities within each relationship tree node
    function sortRelationTreeSequence(sequence) {

        for (let i = 0; i < MAX_SORT_LOOP / 2; i++) {
            let referenceTree;
            for (let j = 0; j < sequence.length; j++) {
                let rtree = sequence[j];
                if (referenceTree === undefined) {
                    referenceTree = rtree;
                    continue;
                }
                sortRelationTreeByReference(referenceTree, rtree);
            }
            referenceTree = undefined;
            for (let j = sequence.length - 1; j >= 0; j--) {
                let rtree = sequence[j];
                if (referenceTree === undefined) {
                    referenceTree = rtree;
                    continue;
                }
                sortRelationTreeByReference(referenceTree, rtree);
            }
        }
    }

    function sortRelationTreeByReference(referenceTree, rtree) {
        let order = getEntitiesOrder(referenceTree);
        sortSingleRelationTree(rtree);

        function sortSingleRelationTree(target) {
            if (target === undefined) {
                return;
            }
            // post-order dfs
            if (hasChildren(referenceTree)) {
                for (let child of referenceTree.children) {
                    sortRelationTreeByReference(child);
                }
            }
            let sessionWeights = new Map();
            for (let [sessionId, entityInfoArray] of target.sessions) {
                let validWeight = 0;
                let validNum = 0;
                // sort within a session (second level)
                entityInfoArray.sort((a, b) => {
                    let weightOfA = order.get(a.entity);
                    let weightOfB = order.get(b.entity);
                    // push eneities not in reference frame in back
                    if (weightOfA === undefined && weightOfB === undefined) {
                        return 0;
                    }
                    if (weightOfA === undefined) {
                        return 1;
                    }
                    if (weightOfB === undefined) {
                        return -1;
                    }
                    return weightOfA - weightOfB;
                });

                entityInfoArray.forEach((entityInfo) => {
                    let weight = order.get(entityInfo.entity);
                    if (weight) {
                        validWeight += weight;
                        validNum += 1;
                    }
                });

                let weightOfSession = Number.MAX_SAFE_INTEGER;
                if (validNum !== 0) {
                    // all entities in this session is not in reference frame, push it to back
                    weightOfSession = validWeight / validNum;
                }
                sessionWeights.set(sessionId, weightOfSession);
            }
            // sort sessions
            target.sessions = new Map([...target.sessions].sort((a, b) =>
                // a[0] is key of entry
                sessionWeights.get(a[0]) - sessionWeights.get(b[0])
            ));
        }
    }

    return storyFlow;
}