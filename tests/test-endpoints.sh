#!/usr/bin/env bash 

if ! which curl; then 
    echo curl not found
    exit 1
fi

readonly RED="\033[0;31m"
readonly GREEN="\033[0;32m"
readonly YELLOW="\033[0;33m"
readonly RESET="\033[0m"
readonly BOLD="\033[1m"

number_succeeded=0
number_failed=0
number_expected_failed=0
number_tests=0

project_dir="$(pwd)"
target_dir="/tmp/lingua-franca"
mkdir -p "$target_dir"

# create a symlink between /tmp/lingua-franca/schemas and ./schemas relative to the project root
ln -sfn "$project_dir/schemas" "$target_dir/schemas"

# start server
npm run build || { echo "Build failed"; exit 1; }
cd "$target_dir" || exit 1
node "$project_dir" &

readonly server_pid=$!

cleanup() {
    kill $server_pid 
    rm -rf "$target_dir"
    echo "---"
    echo "$number_tests tests completed"
    echo -e "${GREEN}✓ $number_succeeded passed${RESET}"
    echo -e "${YELLOW}~ $number_expected_failed expected failures${RESET}"
    echo -e "${RED}✗ $number_failed failed${RESET}"
    exit $number_failed
}

# automatically closes node server on ctrl+c
trap cleanup EXIT

sleep 2 # give it time to start up
# if server_pid still running after 2 seconds we know it didnt die instantly
if ! kill -0 $server_pid 2>/dev/null; then
    echo "failed to run server (process died immediately)"
    exit 1
fi
echo started node server with pid $server_pid
echo
echo Running tests...
echo "---"


### TESTING FUNCTIONS ###


current_test_name="No Name"
runtest() {
    current_test_name=$1
    printf "$BOLD$1$RESET... "
}

print-body() {
    local body="$@"

    if [[ $body == "" ]]; then
        return
    fi

    if jq empty 2>/dev/null <<<"$body"; then
        echo "json response:"
        jq <<<"$body"
    else
        echo "text response:"
        echo "$body"
    fi
}

endtest() {
    local exit_code=$1
    let number_tests++
    if [[ $exit_code != 0 ]]; then
        echo -e "${RED}failed test: \"$current_test_name\"${RESET}"
        let number_failed++
    else
        let number_succeeded++
        echo -e "${GREEN}✓${RESET}"
        echo -e "${GREEN}succeeded test: \"$current_test_name\"${RESET}"
    fi

    print-body $curl_body
}

endtest-if-failed() {
    if [[ $1 != 0 ]]; then
        endtest $@
    fi
}

endtest-expect-fail() {
    local exit_code=$1
    let number_tests++
    # was the status code not a success code, or the last command failed
    if [[ $exit_code != 0 ]]; then
        echo -e "${YELLOW}✓${RESET}"
        let number_expected_failed++
    else
        let number_failed++
        echo -e "${RED}✗${RESET}"
    fi

    print-body $curl_body
}

do-curl() {
    curl_body=$(curl "$@")
    return $? # stored in a variable so endtest can read it after this function returns
}


### TESTS ###


# test for add subject
runtest "add subject"

user=12

do-curl localhost:3000/subjects \
||||||| parent of acf6072 (fix: call print-body before endtest)
        -d "{\"userId\": $user}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent
    
endtest $?


# add existing subject twice
runtest "add existing subject again"

do-curl localhost:3000/subjects \
        -d "{\"userId\": $user}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent
)

endtest-expect-fail $?


# test for delete subject
runtest "delete subject"

do-curl "localhost:3000/subjects?userId=$user" \
        -X DELETE \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest $?


# test for add object
runtest "add object"

do-curl localhost:3000/objects \
        -d '{
                "type": "EHR",
                "identifier": "Bob"
            }' \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest $?


# test for delete object
runtest "delete object"

do-curl localhost:3000/objects?type=EHR\&identifier=Bob \
        -X DELETE \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest $?


# test for modify object
runtest "modify object"

# first add bob again (he was deleted earlier)
do-curl localhost:3000/objects \
    -d '{
            "type": "EHR",
            "identifier": "Bob"
        }' \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --max-time 5 \
    --fail-with-body \
    --silent

# If adding bob failed for some reason, end the test
endtest-if-failed $?

do-curl localhost:3000/objects \
        -X PUT \
        -d '{
                "original": {
                    "type": "EHR",
                    "identifier": "Bob"
                },
                "modified": {
                    "type": "EHR",
                    "identifier": "Bobs leg surgery"
                }
            }' \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest $?


# test for add relation
runtest "add relation"

# add a subject again
do-curl localhost:3000/subjects \
    -d "{\"userId\": $user}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --max-time 5 \
    --fail-with-body \
    --silent

endtest-if-failed $?

post_body=$(cat <<END
    {
        "object": {
            "type": "EHR",
            "identifier": "Bobs leg surgery"
        },
        "name": "viewer",
        "subject": $user
    }
END
)

do-curl localhost:3000/relations \
        -d "$post_body" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest $?


# test for delete relation
runtest "delete relation"

do-curl "localhost:3000/relations?objectType=EHR&objectIdentifier=Bobs%20leg%20surgery&name=viewer&subject=$user" \
        -X DELETE \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest $?


runtest "authorization"

post_body=$(cat <<END
    {
        "object": {
            "type": "EHR",
            "identifier": "Bobs leg surgery"
        },
        "name": "viewer",
        "subject": $user
    }
END
)

do-curl localhost:3000/relations \
        -d "$post_body" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest-if-failed $?

do-curl "localhost:3000/authorize?type=EHR&objectId=Bobs%20leg%20surgery&permission=can_view&userId=$user" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest $?


runtest "authorizing on an object that doesn't exist"

do-curl "localhost:3000/authorize?type=EHR&objectId=fortnitepeter2009&permission=can_view&userId=$user" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest-expect-fail $?


runtest "authorizing on a type that doesn't exist"


do-curl "localhost:3000/authorize?type=poop&objectId=Bobs%20leg%20surgery&permission=can_view&userId=$user" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest-expect-fail $?


runtest "authorizing a user that doesn't exist"

do-curl "localhost:3000/authorize?type=EHR&objectId=Bobs%20leg%20surgery&permission=can_view&userId=999" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest-expect-fail $?


runtest "authorizing for a permission that doesn't exist"

do-curl "localhost:3000/authorize?type=EHR&objectId=Bobs%20leg%20surgery&permission=can_play_fortnite&userId=$user" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent

endtest-expect-fail $?
