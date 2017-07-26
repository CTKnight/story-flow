import {readinData} from "../../src/js/story-flow"
import axios from "axios";

axios.get("../test/Data/inception.xml").then((d) => {
            readinData(d.data);
        });