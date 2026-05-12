#!/usr/bin/env bash 

if ! which curl; then 
    echo curl not found
    exit 1
fi   

# start server
npm run build
node . &
server_pid=$!
if [[ $? != 0 ]]; then
    echo failed to run server, exit code: $?
    exit 1
else
    sleep 2
    echo started node server with pid $server_pid
fi 

RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RESET="\033[0m"

number_succeeded=0
number_failed=0
number_expected_failed=0
number_tests=0

cleanup() {
    kill $server_pid 
    echo "$number_tests tests completed"
    echo -e "${GREEN}$number_succeeded tests succeeded${RESET}"
    echo -e "${YELLOW}$number_expected_failed tests failed expectedly${RESET}"
    echo -e "${RED}$number_failed tests failed${RESET}"
}

# Automatically closes node server on ctrl+c
trap cleanup EXIT


current_test_name=""

runtest() {
    current_test_name=$1
    echo runnning test: \"$1\"
}


endtest() {
    if [[ $? != 0 ]]; then
        echo -e "${RED}failed test: \"$current_test_name\"${RESET}"
        number_failed=$(($number_failed + 1))
    else
        number_succeeded=$(($number_succeeded + 1))
        echo -e "${GREEN}succeeded test: \"$current_test_name\"${RESET}"
    fi
    number_tests=$(($number_tests + 1))

    if [ -n "$curl_body" ] && jq empty >/dev/null 2>&1 <<<"$curl_body"; then 
        echo "json response:"
        jq 2>/dev/null <<<"$curl_body"
    else
        echo "text response:"
        echo "$curl_body"
    fi

    curl_body=""
}

endtest-if-failed() {
    if [[ $? != 0 ]]; then
        endtest
    fi
}

endtest-expect-fail() {
    # Was the statuscode not a success code, or the last command fialed
    if [[ "$1" != "2"* ]] || [[ $? != 0 ]]; then
        echo -e "${YELLOW}failed test expectedly: \"$current_test_name\"${RESET}"
        number_expected_failed=$(($number_expected_failed + 1))
    else
        number_failed=$(($number_failed + 1))
        echo -e "${RED}Failed test unexpectedly: \"$current_test_name\"${RESET}"
    fi
    number_tests=$(($number_tests + 1))

    echo
}

# test for add subject
runtest "add subject"

user=12

curl_body=$(
    curl localhost:3000/subjects \
        -d "{\"userId\": $user}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent
)
    
endtest 

# Add existing subject twice
runtest "add existing subject again"

curl_body=$(
    curl localhost:3000/subjects \
        -d "{\"userId\": $user}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent \
        --output /dev/null \
        --write-out "%{http_code}" # Only get the status code of the result
)

endtest-expect-fail "$curl_body"

# test for delete subject
runtest "delete subject"

curl_body=$(
    curl localhost:3000/subjects?userId=12 \
        -X DELETE \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent
)

endtest


# test for add object
runtest "add object"

curl_body=$(
    curl localhost:3000/objects \
        -d '{
                "type": "EHR",
                "identifier": "Bob"
            }' \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent
)

endtest

# test for delete object
runtest "delete object"

curl_body=$(
    curl localhost:3000/objects?type=EHR\&identifier=Bob \
        -X DELETE \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent
)

endtest
# test for modify object
runtest "modify object"

# First add bob again (he was deleted earlier)
curl localhost:3000/objects \
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
endtest-if-failed

curl_body=$(
    curl localhost:3000/objects \
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
)

endtest

# test for add relation
runtest "add relation"

# Add a subject again

curl localhost:3000/subjects \
    -d "{\"userId\": $user}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --max-time 5 \
    --fail-with-body \
    --silent

endtest-if-failed

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

curl_body=$(
    curl localhost:3000/relations \
        -d "$post_body" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent
)

endtest

# test for delete relation
runtest "delete relation"

curl_body=$(
    curl "localhost:3000/relations?objectType=EHR&objectIdentifier=Bobs%20leg%20surgery&name=viewer&subject=$user" \
        -X DELETE \
        -H "Accept: application/json" \
        --max-time 5 \
        --fail-with-body \
        --silent
)

endtest

