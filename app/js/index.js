import {data} from "../../src/js/story-flow";
import axios from "axios";

axios.get("../test/Data/matrix.xml").then((d) => {
            data(d.data);
        });