import {
    solveQP
} from "quadprog";

function defaultGetLocationTree(data) {
    return data.locationTree;
}

function defaultGetSessionTable(data) {
    return data.sessionTable;
}

function defaultGetWeight(entity) {
    return entity.weight;
}

function defaultEntities(data) {
    return data.entities;
}

function defaultKeyTimeframe(data) {
    return data.keyTimeframe;
}

function hasChildren(_) {
    return !(!Array.isArray(_.children) || _.children.length === 0);
}

function create2DArray(row, column, defaultValue) {
    return defaultValue === undefined ? [...Array(row).keys()].map(() => Array(column)) : [...Array(row).keys()].map(() => Array(column).fill(defaultValue));
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

// maximum number of straight segments we can get is LC-substring problem
// https://www.wikiwand.com/en/Longest_common_substring_problem
function longestCommonSubstring(sessionA, sessionB) {
    // session: [sessionId, [EntityInfo]]
    // make its index starts from 1 for DP 
    // copy array for re-entrance
    let reference = sessionA[1].slice();
    reference.unshift(undefined);
    let target = sessionB[1].slice();
    target.unshift(undefined);

    let m = sessionA[1].length;
    let n = sessionB[1].length;
    let z = 0;
    let result = [];

    let table = create2DArray(m + 1, n + 1);

    for (let i = 0; i <= m; i++) {
        table[i][0] = 0;
    }
    for (let i = 0; i <= n; i++) {
        table[0][i] = 0;
    }

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (reference[i].entity === target[j].entity) {
                table[i][j] = table[i - 1][j - 1] + 1;
                if (table[i][j] > z) {
                    z = table[i][j];
                    result = reference.slice(i - z + 1, i);
                } else if (table[i][j] === z) {
                    result.concat(reference.slice(i - z + 1, i));
                }
            } else {
                table[i][j] = 0;
            }
        }
    }

    return result;
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
    // entities: [string];
    function storyFlow() {
        data = {
            locationTree: defaultGetLocationTree.apply(null, arguments),
            sessionTable: defaultGetSessionTable.apply(null, arguments)
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
        preprocessData(data);
        sortLocationTree(data.locationTree);
        let sequence = constructRelationshipTreeSequence();
        if (sequence.length <= 1) {
            // for robuteness
            return;
        }
        sortRelationTreeSequence(sequence);
        let alignedSessions = alignSequence(sequence);
        compactLayout(sequence, alignedSessions);
    }

    function preprocessData(data) {
        console.log(data);
        // use set to remove duplicate
        let entities = new Set(),
            keyTimeframe = new Set(),
            maxTimeframeTable = new Map();
        for (let [sessionId, entityInfoArray] of data.sessionTable) {
            entityInfoArray.forEach((entityInfo) => {
                let entity = entityInfo.entity;
                if (!entities.has(entity)) {
                    entities.add(entity);
                    maxTimeframeTable.set(entity, Number.MIN_SAFE_INTEGER);
                }
                keyTimeframe.add(entityInfo.start);
                keyTimeframe.add(entityInfo.end);
                if (entityInfo.end > maxTimeframeTable.get(entity)) {
                    maxTimeframeTable.set(entity, entityInfo.end);
                }
            });
        }

        data.entities = [...entities];
        data.keyTimeframe = [...keyTimeframe].sort((a, b) => a - b);
        data.maxTimeframeTable = maxTimeframeTable;
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
        // not necessary to build all timeframe 
        // just build at timeframe when change happens
        for (let timeframe of data.keyTimeframe) {
            sequence.push([timeframe, buildSingleRelationshipTree(timeframe)]);
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
                        // second condition is for the last session in this entity
                        let ret = infoList.filter((info) => (info.start <= timeframe && timeframe < info.end) ||
                            (timeframe === data.maxTimeframeTable.get(info.entity) && timeframe === info.end));
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
                // sequence is [[timeframe, rtree]]
                let [_, rtree] = sequence[j];
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
                let [_, rtree] = sequence[j];
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
        result.push([0, undefined]);
        // initial position has no aligned pairs
        for (let i = 0; i + 1 < sequence.length; i++) {
            let [_, previous] = sequence[i];
            let [__, next] = sequence[i + 1];

            let previousOrder = previous.sessionOrder;
            if (previousOrder === undefined) {
                // intial one
                previousOrder = previous.sessionOrder = getSessionOrder(previous);
            }

            let nextOrder = getSessionOrder(next);
            next.sessionOrder = nextOrder;
            // it contains aligned session pairs
            // between j and j - 1 timeframe
            result.push([sequence[i + 1][0], alignSingleGap(previousOrder, nextOrder)]);
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
                    let [_, previousEntitiesInfoArray] = previousOrder[i];
                    let [__, nextEntitiesInfoArray] = nextOrder[i];
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
                return longestCommonSubstring(sessionA, sessionB).length +
                    RELATIVE_FACTOR_ALPHA * relativeSimilarity(
                        previousOrder.indexOf(sessionA),
                        nextOrder.indexOf(sessionB),
                        previousOrder.length,
                        nextOrder.length);
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

        const sameSessionGap = SAME_SESSION_FACTOR * lineWidth,
            diffSessionGap = DIFFERENT_SESSION_FACTOR * lineWidth;

        console.log(sequence);
        console.log(alignedSessions);

        // s(i, j) is the line segment for entity i at time j
        // use as variable index
        let indexTable = new Map();
        for (let entity of data.entities) {
            indexTable.set(entity, new Map());
        }

        let index = 0;
        for (let [timeFrame, rtree] of sequence) {
            for (let [sessionId, entitiesInfo] of rtree.sessionOrder.filter(v => v)) {
                for (let entityInfo of entitiesInfo) {
                    indexTable.get(entityInfo.entity).set(timeFrame, ++index);
                }
            }
        }

        console.log(indexTable);

        // the amount of constrain is not known yet
        // Amat is n * m matrix
        // m constraints and n variables
        // index base 1
        // at here index is the total count of vars
        let Amat = create2DArray(index + 1, 0);

        let Dmat = create2DArray(index + 1, index + 1, 0);
        for (let i = 0; i + 1 < sequence.length; i++) {
            let timeGap = sequence[i + 1][0] - sequence[i][0];
            secondTerm(sequence[i][1].sessionOrder, sequence[i][0], timeGap);
        }

        let bvec = [];
        let dvec = new Array(index + 1);
        dvec.fill(0);
        // the last rtree
        let lastTree = sequence[sequence.length - 1];
        if (lastTree) {
            secondTerm(lastTree[1].sessionOrder, lastTree[0], 1);
        }
        // first term
        for (let [entity, indexMap] of indexTable) {
            let timeframeOfEntity = [...indexMap].sort((a, b) => a[0] - b[0]);
            for (let i = 1; i < timeframeOfEntity.length; i++) {
                let previousIndex = timeframeOfEntity[i - 1][1];
                let currentIndex = timeframeOfEntity[i][1];
                // (y1 - y2)^2 = y1^2 - y1*y2 - y2*y1 + y2^2
                // which makes it symmetric 
                Dmat[previousIndex][previousIndex] += 1;
                Dmat[currentIndex][currentIndex] += 1;
                Dmat[previousIndex][currentIndex] -= 1;
                Dmat[currentIndex][previousIndex] -= 1;
            }
        }

        // construct equality contraints first
        let constraintCount = 0;
        // construct constraints matrix according to extent, alignments and fomulas
        // eq constraint 1: entities under same sessions
        for (let [timeframe, rtree] of sequence) {
            let sessionOrder = rtree.sessionOrder.filter(v => v);
            for (let [sessionId, entityInfoArray] of sessionOrder) {
                let previousEntityIndex;
                for (let entityInfo of entityInfoArray) {
                    let currentEntityIndex = indexTable.get(entityInfo.entity).get(timeframe);
                    if (previousEntityIndex === undefined) {
                        previousEntityIndex = currentEntityIndex;
                        continue;
                    } else {
                        constraintCount++;
                        initializeColumn(Amat, constraintCount);
                        Amat[previousEntityIndex][constraintCount] = -1;
                        Amat[currentEntityIndex][constraintCount] = 1;
                        bvec[constraintCount] = sameSessionGap;
                        previousEntityIndex = currentEntityIndex;
                    }
                }
            }
        }
        // eq constraint 2: aligned entities
        for (let i = 1; i < sequence.length; i++) {
            let [timeframe, currentRTree] = sequence[i];
            let [previousTimeframe, previousRTree] = sequence[i - 1];
            let alignedPair = alignedSessions[i][1];
            if (alignedPair === undefined) {
                // entities are all the same, aligned them all
                for (let [sessionId, entityInfoArray] of currentRTree.sessionOrder.filter(v => v)) {
                    for (let entityInfo of entityInfoArray) {
                        buildEqualityAlignmentConstraint(entityInfo);
                    }
                }
            } else {
                for (let [newSession, oldSession] of [...alignedPair].sort((a, b) => a[0] - b[0])) {
                    let lcsubstring = longestCommonSubstring(currentRTree.sessionOrder[newSession], previousRTree.sessionOrder[oldSession]);
                    if (lcsubstring.length === 0) {
                        continue;
                    }

                    let firstCommonEntity = lcsubstring[0];
                    let firstIndex = currentRTree.sessionOrder[newSession][1].indexOf(firstCommonEntity);
                    for (let j = 0; j < length; j++, firstIndex++) {
                        buildEqualityAlignmentConstraint(currentRTree.sessionOrder[newSession][1][firstIndex]);
                    }
                }
            }

            function buildEqualityAlignmentConstraint(entityInfo) {
                let currentIndex = indexTable.get(entityInfo.entity).get(timeframe);
                let previousIndex = indexTable.get(entityInfo.entity).get(previousTimeframe);
                constraintCount++;
                initializeColumn(Amat, constraintCount);
                Amat[currentIndex][constraintCount] = 1;
                Amat[previousIndex][constraintCount] = -1;
                bvec[constraintCount] = 0;
            }


        }

        let meq = constraintCount;
        // ineq constraint 3: different session entities gap

        for (let [timeframe, rtree] of sequence) {
            let sessionOrder = rtree.sessionOrder.filter(v => v);
            if (sessionOrder.length <= 1) {
                continue;
            }
            let lastEntityOfPreviousSessionIndex = indexTable.get(sessionOrder[0][1][sessionOrder[0][1].length - 1].entity).get(timeframe);
            for (let i = 1; i < sessionOrder.length; i++) {
                let firstEntityOfCurrentSessionIndex = indexTable.get(sessionOrder[i][1][0].entity).get(timeframe);
                constraintCount++;
                initializeColumn(Amat, constraintCount);
                Amat[lastEntityOfPreviousSessionIndex][constraintCount] = -1;
                Amat[firstEntityOfCurrentSessionIndex][constraintCount] = 1;
                bvec[constraintCount] = diffSessionGap;
                lastEntityOfPreviousSessionIndex = indexTable.get(sessionOrder[i][1][sessionOrder[i][1].length - 1].entity).get(timeframe);
            }
        }


        // ineq range 0 <= y <= y_max
        for (let i = 1; i <= index; i++) {
            // >= 0
            constraintCount++;
            initializeColumn(Amat, constraintCount);
            Amat[i][constraintCount] = 1;
            bvec[constraintCount] = 0;
        }

        console.log(Amat);
        console.log(Dmat);
        console.log(bvec);
        console.log(meq);
        console.log(index);

        let solution = solveQP(Dmat, dvec, Amat, bvec, meq);
        let solutionSet = solution.solution.map(Math.round);

        console.log(solution);

        function secondTerm(sessionOrder, timeframe, timeGap) {
            sessionOrder = sessionOrder.filter(v => v);
            for (let [sessionId, entityInfoArray] of sessionOrder) {
                for (let entityInfo of entityInfoArray) {
                    let sij = indexTable.get(entityInfo.entity).get(timeframe);
                    Dmat[sij][sij] += timeGap;
                }
            }
        }

        function initializeColumn(Amat, column) {
            for (let i = 0; i < Amat.length; i++) {
                Amat[i][column] = 0;
            }
        }
    }

    return storyFlow;
}