import {solveQP} from "quadprog";

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

function create2DArray(row, column) {
    return [...Array(row).keys()].map(() => Array(column));
}
// children function should return [node]? 
// post-order dfs util function
function postOrderDfsVisit(node, visitFunction, childrenFunction) {
    if (!node) {
        return;
    }

    let children = childrenFunction(node);

    if (Array.isArray(children)) {
        for (let child of children) {
            postOrderDfsVisit(child, visitFunction, childrenFunction);
        }
    }

    visitFunction(node);
}

export default function () {
    // for some special cases like dummy head
    const MAX_SORT_LOOP = 20;
    const RELATIVE_FACTOR_ALPHA = 0.1;
    const SAME_SESSION_FACTOR = 3;
    const DIFFERENT_SESSION_FACTOR = 9;
    // record the best path direction
    const LEFT = "LEFT",
        LEFT_UP = "LEFT_UP",
        UP = "UP";

    // settings and parameters
    let graph, data;

    // extent
    let x0 = 0,
        y0 = 0,
        x1 = 1,
        y1 = 1,
        lineWidth = 3;
    // data: locationTree: TreeNode
    // sessionTable: Map<Int, EntityInfo[]>
    // timeSpan: {maxTimeframe:Int, minTimeframe:Int}
    function storyFlow() {
        data = {
            locationTree: defaultGetLocationTree.apply(null, arguments),
            sessionTable: defaultGetSessionTable.apply(null, arguments),
            timeSpan: defaultTimeSpan.apply(null, arguments)
        };
        layout(data);
        // return graph and relationshipTree for UI
        return graph;
    }

    storyFlow.layout = layout;

    // the x, y axis range
    storyFlow.extent = function (_) {
        return arguments.length ? (x0 = +_[0][0], x1 = +_[1][0], y0 = +_[0][1], y1 = +_[1][1], storyFlow) : [
            [x0, y0],
            [x1, y1]
        ];
    };

    storyFlow.lineWidth = function (_) {
        return arguments.length ? (lineWidth = _, storyFlow) : lineWidth;
    };

    function layout(data) {
        sortLocationTree(data.locationTree);
        let sequence = constructRelationshipTreeSequence();
        sortRelationTreeSequence(sequence);
        let alignedSessions = alignSequence(sequence);
        compactLayout(sequence, alignedSessions);
        return storyFlow;
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


            // Each tree node
            // represents a location and includes all the session IDs that occur at the
            // location.
            // including children's 
            // SessionId -> time span and entity
            // this function add a set of entities 
            function calculateTotalEntityNum(locationTree, forced) {
                let sessionTable = data.sessionTable;
                // already calculated and not forced to update
                if (locationTree.entities && !forced) {
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
        }
    }

    function constructRelationshipTreeSequence() {
        let sequence = [];
        for (let timeframe = data.timeSpan.minTimeframe; timeframe < data.timeSpan.maxTimeframe; timeframe++) {
            sequence.push(buildSingleRelationshipTree(timeframe));
        }
        return sequence;


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
    }

    // sort sessions and entities within each relationship tree node
    function sortRelationTreeSequence(sequence) {

        for (let i = 0; i < MAX_SORT_LOOP / 2; i++) {
            let referenceTree;
            for (let j = 0; j < sequence.length; j++) {
                let rtree = sequence[j];
                if (referenceTree === undefined) {
                    referenceTree = rtree;
                    // use initial as reference
                    rtree.order = getEntitiesOrder(rtree);
                    continue;
                }
                sortRelationTreeByReference(referenceTree, rtree);
                // update reference frame
                referenceTree = rtree;
            }
            // sweep from the last but 2 rtree
            for (let j = sequence.length - 2; j >= 0; j--) {
                let rtree = sequence[j];
                sortRelationTreeByReference(referenceTree, rtree);
                referenceTree = rtree;
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

        function sortRelationTreeByReference(referenceTree, rtree) {
            let order = referenceTree.order;
            sortSingleRelationTree(rtree);
            // update order after sorting
            rtree.order = getEntitiesOrder(rtree);

            function sortSingleRelationTree(target) {
                if (target === undefined) {
                    return;
                }
                // post-order dfs
                if (hasChildren(target)) {
                    for (let child of target.children) {
                        sortSingleRelationTree(child);
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
    }

    function alignSequence(sequence) {
        let result = [];
        // initial position has no aligned pairs
        result.push(new Map());
        for (let i = 0; i + 1 < sequence.length; i++) {
            let previous = sequence[i];
            let next = sequence[i + 1];

            let previousOrder = previous.sessionOrder;
            if (previousOrder === undefined) {
                // intial one
                previousOrder = previous.sessionOrder = getSessionOrder(previous);
            }

            let nextOrder = getSessionOrder(next);
            next.sessionOrder = nextOrder;

            result.push(alignSingleGap(previousOrder, nextOrder));
        }

        return result;

        function getSessionOrder(root) {
            let result = [];
            dfsGetOrder(root);
            // the output array should use index that starts from 1 for dynammic programming
            result.unshift(undefined);
            return result;

            function dfsGetOrder(rtree) {
                if (hasChildren(rtree)) {
                    for (let child of rtree.children) {
                        dfsGetOrder(child);
                    }
                }
                delete rtree.order;
                for (let entry of rtree.sessions) {
                    result.push(entry);
                }
            }

        }

        // previousOrder: [[sessionId, [EntityInfo: {entity: String, start:Int, end:Int}]]
        // dynamic programming 
        // the input array should use index that starts from 1
        function alignSingleGap(previousOrder, nextOrder) {

            // use undefined to indicate that the orders are identical
            if (isIdenticalOrder(previousOrder, nextOrder)) {
                return undefined;
            }

            // the input array should use index that starts from 1
            // length include the dummy undefined
            let m = previousOrder.length - 1,
                n = nextOrder.length - 1;
            // zero index included
            let dynamicTable = create2DArray(m + 1, n + 1);
            let pathTable = create2DArray(m + 1, n + 1);

            // match(i,j) = max (match(i-1, j-1) + sim(li, rj), match(i-1, j), match(i, j-1)) : if i > 0 and j > 0
            //            = 0 : if i = 0 or j = 0

            for (let i = 0; i <= m; i++) {
                dynamicTable[i][0] = 0;
            }

            for (let i = 0; i <= n; i++) {
                dynamicTable[0][i] = 0;
            }

            for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                    let left = dynamicTable[i - 1][j],
                        leftUp = dynamicTable[i - 1][j - 1] + similarity(previousOrder[i], nextOrder[j]),
                        up = dynamicTable[i][j - 1],
                        max = Math.max(left, leftUp, up),
                        pathDirection;
                    dynamicTable[i][j] = max;

                    switch (max) {
                        case leftUp:
                            pathDirection = LEFT_UP;
                            break;
                        case left:
                            pathDirection = LEFT;
                            break;
                        case up:
                            pathDirection = UP;
                            break;
                        default:
                            break;
                    }

                    pathTable[i][j] = pathDirection;
                }
            }

            return getAlignedSessionPairs(pathTable);

            function isIdenticalOrder(previousOrder, nextOrder) {
                if (previousOrder.length !== nextOrder.length) {
                    return false;
                }
                for (let i = 1; i < previousOrder.length; i++) {
                    let previousEntitiesInfoArray = previousOrder[i];
                    let nextEntitiesInfoArray = nextOrder[i];
                    if (previousEntitiesInfoArray.length !== nextEntitiesInfoArray.length) {
                        return false;
                    }
                    for (let j = 0; j < previousEntitiesInfoArray.length; j++) {
                        let entityInfo = previousEntitiesInfoArray[j];
                        let nextEntityInfo = nextEntitiesInfoArray[j];
                        if (entityInfo.entity !== nextEntityInfo.entity) {
                            return false;
                        }
                    }
                }
                return true;
            }

            function similarity(sessionA, sessionB) {
                return longestCommonSubsquenceLength(sessionA, sessionB) +
                    RELATIVE_FACTOR_ALPHA * relativeSimilarity(
                        previousOrder.indexOf(sessionA),
                        nextOrder.indexOf(sessionB),
                        previousOrder.length,
                        nextOrder.length);
            }

            function longestCommonSubsquenceLength(sessionA, sessionB) {
                // session: [sessionId, [EntityInfo]]
                // make its index starts from 1 for DP 
                let reference = sessionA[1].slice();
                reference.unshift(undefined);
                let target = sessionB[1].slice();
                target.unshift(undefined);

                let m = sessionA[1].length;
                let n = sessionB[1].length;

                let table = create2DArray(m + 1, n + 1);

                for (let i = 0; i <= m; i++) {
                    table[i][0] = 0;
                }
                for (let i = 0; i <= n; i++) {
                    table[0][i] = 0;
                }

                for (let i = 1; i <= m; i++) {
                    for (let j = 1; j <= n; j++) {
                        if (reference[i].entity == target[j].entity) {
                            table[i][j] = table[i - 1][j - 1] + 1;
                        } else {
                            table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
                        }
                    }
                }

                return table[m][n];
            }

            // i,j is session index, m,n is session squence length
            function relativeSimilarity(i, j, m, n) {
                return (1 - Math.abs(i / m - j / n));
            }

            function getAlignedSessionPairs(pathTable) {
                let result = new Map();

                let m = pathTable.length - 1;
                let n = pathTable[m].length - 1;

                for (let target = pathTable[m][n]; target; target = pathTable[m][n]) {
                    if (m === 0 || n === 0) {
                        break;
                    }

                    switch (target) {
                        case LEFT_UP:
                            // one session can align up to one session
                            // so use map, use session in t+1 as key for convenience in QP
                            result.set(n, m);
                            m -= 1;
                            n -= 1;
                            break;
                        case LEFT:
                            m -= 1;
                            break;
                        case UP:
                            n -= 1;
                            break;
                        default:
                            break;
                    }
                }

                return result;
            }
        }
    }

    function compactLayout(sequence, alignedSessions) {
        console.log(sequence);
        console.log(alignedSessions);

        let nt = alignedSessions.length;

        alignedSessions.forEach((v, i) => {

        });
    }

    return storyFlow;
}